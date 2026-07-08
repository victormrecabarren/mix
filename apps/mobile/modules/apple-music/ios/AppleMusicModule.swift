import ExpoModulesCore
import MusicKit

// Wraps MusicKit's ApplicationMusicPlayer for React Native. Mirrors the
// one-track-at-a-time model the JS PlaybackContext already uses for Spotify
// and SoundCloud: JS calls play(catalogId) per track, we emit state on a
// 500ms timer, and fire onTrackEnd so JS can advance the queue.
public class AppleMusicModule: Module {
  private var pollTimer: Timer?
  private var currentDurationMs: Double = 0
  private var peakPositionMs: Double = 0
  private var hasStartedPlaying = false
  private var trackEnded = false
  private var currentInfo: [String: Any] = [
    "trackTitle": "",
    "artistName": "",
    "artworkUrl": "",
  ]

  public func definition() -> ModuleDefinition {
    Name("AppleMusic")

    Events("onStateChange", "onTrackEnd")

    // Prompt for (or read) MusicKit authorization. Returns the status string.
    // Streaming full tracks additionally requires an active Apple Music
    // subscription on the device — surfaced to JS via checkSubscription().
    AsyncFunction("requestAuthorization") { () async -> String in
      let status = await MusicAuthorization.request()
      return AppleMusicModule.statusString(status)
    }

    Function("getAuthorizationStatus") { () -> String in
      AppleMusicModule.statusString(MusicAuthorization.currentStatus)
    }

    // Resolves the user's Apple Music subscription capabilities.
    // canPlayCatalogContent is false when there's no active subscription.
    AsyncFunction("checkSubscription") { () async throws -> [String: Any] in
      let sub = try await MusicSubscription.current
      return [
        "canPlayCatalogContent": sub.canPlayCatalogContent,
        "canBecomeSubscriber": sub.canBecomeSubscriber,
      ]
    }

    // Play a single catalog song by its Apple Music ID. Replaces whatever was
    // playing (JS owns the queue and calls this once per track).
    AsyncFunction("play") { (catalogId: String, isrc: String?) async throws in
      try await self.playCatalogId(catalogId, isrc: isrc)
    }

    AsyncFunction("resume") { () async throws in
      try await ApplicationMusicPlayer.shared.play()
    }

    Function("pause") {
      ApplicationMusicPlayer.shared.pause()
    }

    Function("seek") { (positionMs: Double) in
      let seconds = positionMs / 1000.0
      ApplicationMusicPlayer.shared.playbackTime = seconds
      self.peakPositionMs = max(self.peakPositionMs, positionMs)
      self.trackEnded = false
    }

    Function("stop") {
      ApplicationMusicPlayer.shared.stop()
    }

    OnStartObserving {
      self.startPolling()
    }

    OnStopObserving {
      self.stopPolling()
    }

    OnDestroy {
      self.stopPolling()
    }
  }

  // ── Playback ────────────────────────────────────────────────────────────────

  @MainActor
  private func playCatalogId(_ id: String, isrc: String?) async throws {
    // Resolve the device's active storefront up front — a mismatch between the
    // storefront a catalog id was minted in and the listener's storefront is a
    // prime cause of "song not found".
    let storefront = (try? await MusicDataRequest.currentCountryCode) ?? "unknown"

    // An Apple catalog id is NOT a stable key for a recording: the same ISRC
    // maps to different catalog ids across storefronts and album compilations.
    // Try the stored id first (fast path), then fall back to resolving by ISRC
    // in THIS device's storefront (stable path). Both attempts' errors are
    // accumulated so a final failure is fully diagnosable.
    var song: Song?
    var attempts: [String] = []

    // ── Attempt 1: stored catalog id ─────────────────────────────────────────
    do {
      var byId = MusicCatalogResourceRequest<Song>(matching: \.id, equalTo: MusicItemID(id))
      byId.limit = 1
      let res = try await byId.response()
      if let s = res.items.first {
        song = s
      } else {
        attempts.append("id \(id): not found in storefront \(storefront)")
      }
    } catch {
      attempts.append("id \(id): threw \(error.localizedDescription)")
    }

    // ── Attempt 2: ISRC fallback (device storefront) ─────────────────────────
    if song == nil, let isrc = isrc, !isrc.isEmpty {
      do {
        var byIsrc = MusicCatalogResourceRequest<Song>(matching: \.isrc, equalTo: isrc)
        byIsrc.limit = 1
        let res = try await byIsrc.response()
        if let s = res.items.first {
          song = s
        } else {
          attempts.append("isrc \(isrc): not found in storefront \(storefront)")
        }
      } catch {
        attempts.append("isrc \(isrc): threw \(error.localizedDescription)")
      }
    }

    guard let song = song else {
      throw NSError(
        domain: "AppleMusic",
        code: 404,
        userInfo: [NSLocalizedDescriptionKey:
          "could not resolve a playable song [storefront \(storefront)] — "
          + attempts.joined(separator: " ; ")]
      )
    }

    self.currentDurationMs = (song.duration ?? 0) * 1000.0
    self.peakPositionMs = 0
    self.hasStartedPlaying = false
    self.trackEnded = false
    self.currentInfo = [
      "trackTitle": song.title,
      "artistName": song.artistName,
      "artworkUrl": song.artwork?.url(width: 300, height: 300)?.absoluteString ?? "",
    ]

    // ── Step 2: enqueue + play ────────────────────────────────────────────────
    let player = ApplicationMusicPlayer.shared
    player.queue = ApplicationMusicPlayer.Queue(for: [song])
    do {
      try await player.play()
    } catch {
      throw NSError(
        domain: "AppleMusic",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey:
          "player.play() threw for id \(id) (\(song.title)) [storefront \(storefront)]: "
          + "\(error.localizedDescription) | \(String(reflecting: error))"]
      )
    }
  }

  // ── State polling ─────────────────────────────────────────────────────────

  private func startPolling() {
    DispatchQueue.main.async {
      self.pollTimer?.invalidate()
      self.pollTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
        self?.emitState()
      }
    }
  }

  private func stopPolling() {
    DispatchQueue.main.async {
      self.pollTimer?.invalidate()
      self.pollTimer = nil
    }
  }

  private func emitState() {
    let player = ApplicationMusicPlayer.shared
    let status = player.state.playbackStatus
    let positionMs = player.playbackTime * 1000.0
    let isPaused = status != .playing

    if status == .playing {
      self.hasStartedPlaying = true
      self.peakPositionMs = max(self.peakPositionMs, positionMs)
    }

    var payload = self.currentInfo
    payload["isPaused"] = isPaused
    payload["currentPosition"] = positionMs
    payload["duration"] = self.currentDurationMs
    self.sendEvent("onStateChange", payload)

    // Natural-end detection. Two signals, whichever fires first:
    //   1. Position reaches the very end while still reporting playback.
    //   2. Player stops/pauses after we'd played to near the end (single-item
    //      queue finishing resets position toward 0). The peak guard avoids
    //      firing when the user simply pauses near the start.
    guard !self.trackEnded, self.currentDurationMs > 0 else { return }
    let nearEnd = positionMs >= self.currentDurationMs - 750
    let wasNearEnd = self.peakPositionMs >= self.currentDurationMs - 1500
    let stoppedAfterNearEnd =
      (status == .stopped || status == .paused) && self.hasStartedPlaying && wasNearEnd
    if nearEnd || stoppedAfterNearEnd {
      self.trackEnded = true
      self.sendEvent("onTrackEnd", [:])
    }
  }

  private static func statusString(_ status: MusicAuthorization.Status) -> String {
    switch status {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    @unknown default: return "unknown"
    }
  }
}
