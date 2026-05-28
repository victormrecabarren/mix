import { UnknownMixError } from "./errors";

export type SoundCloudTrack = {
  url: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
};

// SoundCloud track URLs come in a few flavours:
//   https://soundcloud.com/<artist>/<track-slug>             (canonical)
//   https://m.soundcloud.com/<artist>/<track-slug>           (mobile)
//   https://on.soundcloud.com/<opaque-id>                    (share short link)
//   https://snd.sc/<opaque-id>                               (legacy short link)
// The canonical/mobile form needs path validation (reject /sets/, /discover/);
// the short forms have an opaque single-segment path and need to be resolved
// via redirect before we know what they point to — we accept them at the
// detector level and let resolveSoundCloudTrack chase the redirect.
const SC_LONG_HOST_RE = /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\//i;
const SC_SHORT_HOST_RE = /^https?:\/\/(?:on\.soundcloud\.com|snd\.sc)\//i;
const REJECTED_FIRST_SEGMENTS = new Set([
  "sets",
  "discover",
  "stations",
  "you",
  "pages",
  "mobile",
  "tags",
]);

export function isSoundCloudTrackUrl(input: string): boolean {
  const trimmed = input.trim();
  if (SC_SHORT_HOST_RE.test(trimmed)) return true;
  if (!SC_LONG_HOST_RE.test(trimmed)) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  // Path must be /<artist>/<track-slug>[/...]. Reject any first segment that
  // we know to be a non-track route.
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  if (REJECTED_FIRST_SEGMENTS.has(segments[0]!.toLowerCase())) return false;
  return true;
}

function isShortScUrl(input: string): boolean {
  return SC_SHORT_HOST_RE.test(input.trim());
}

// Follows redirects on a SoundCloud short URL (on.soundcloud.com / snd.sc) to
// recover the canonical track URL. Returns the input as-is if it's already
// canonical or if the redirect can't be resolved.
async function resolveScRedirect(url: string): Promise<string> {
  try {
    // HEAD avoids downloading the HTML page; `Response.url` reflects the final
    // URL after redirects.
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.url || url;
  } catch {
    return url;
  }
}

// Strip the tracking params SoundCloud appends from shares (?si=, ?utm_*).
// The widget accepts them but they make the canonical URL noisy — we'd
// rather store the clean URL.
function canonicalScUrl(input: string): string {
  try {
    const u = new URL(input.trim());
    // Drop everything but the path; SC's player only needs the canonical
    // host + path.
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return input.trim();
  }
}

type OEmbedResponse = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
};

// Resolves a SoundCloud track URL to displayable metadata via the public
// oEmbed endpoint (no auth, no API key). Used both in the submission picker
// (preview before commit) and to populate submission metadata. Handles share
// short links (on.soundcloud.com / snd.sc) by chasing the redirect to recover
// the canonical track URL first.
export async function resolveSoundCloudTrack(
  rawUrl: string,
): Promise<SoundCloudTrack> {
  if (!isSoundCloudTrackUrl(rawUrl)) {
    throw new UnknownMixError("Not a SoundCloud track URL");
  }
  // Short share URLs must be resolved to a canonical /artist/track URL before
  // oEmbed will recognize them.
  const resolved = isShortScUrl(rawUrl)
    ? await resolveScRedirect(rawUrl.trim())
    : rawUrl;
  const url = canonicalScUrl(resolved);
  const oembedUrl = `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  let res: Response;
  try {
    res = await fetch(oembedUrl);
  } catch {
    throw new UnknownMixError("Couldn't reach SoundCloud");
  }
  if (!res.ok) {
    throw new UnknownMixError(`SoundCloud lookup failed (${res.status})`);
  }
  const data = (await res.json()) as OEmbedResponse;
  // Title sometimes comes back as "Title by Artist". Strip the trailing
  // " by <author>" if we can confirm the author matches author_name — keeps
  // the title clean without risking false positives on legitimate "by" titles.
  const author = (data.author_name ?? "").trim();
  let title = (data.title ?? "").trim();
  if (author && title.toLowerCase().endsWith(` by ${author.toLowerCase()}`)) {
    title = title.slice(0, title.length - (` by ${author}`.length)).trim();
  }
  return {
    url,
    title: title || "Untitled",
    artist: author || "Unknown artist",
    artworkUrl: data.thumbnail_url ?? null,
  };
}
