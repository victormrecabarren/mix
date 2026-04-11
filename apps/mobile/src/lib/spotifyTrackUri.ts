/**
 * Normalize input to `spotify:track:<22-char-id>` for PUT /v1/me/player/play.
 *
 * Accepts:
 * - `https://open.spotify.com/track/...` (with optional `intl-xx/` segment)
 * - `spotify:track:...`
 * - bare 22-character track id
 */
export function normalizeSpotifyTrackUri(input: string): string {
  const s = input.trim();
  if (!s) return s;

  const urlMatch = s.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([0-9A-Za-z]{22})\b/);
  if (urlMatch) return `spotify:track:${urlMatch[1]}`;

  const uriMatch = s.match(/^spotify:track:([0-9A-Za-z]{22})$/);
  if (uriMatch) return `spotify:track:${uriMatch[1]}`;

  if (/^[0-9A-Za-z]{22}$/.test(s)) return `spotify:track:${s}`;

  return s;
}
