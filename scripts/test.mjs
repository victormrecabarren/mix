#!/usr/bin/env node
// ─── mix test flow script ────────────────────────────────────────────────────
//
// Commands:
//   node scripts/test.mjs setup-players --league <id>
//     Create fake players A, B, C (if not already created) and add to league.
//     Safe to re-run for new leagues — skips creation if player already exists.
//     D and E are excluded; use create-user / join for their flows.
//
//   node scripts/test.mjs create-user --player <D|E>
//     Create a user account with no league membership.
//     Simulates a user who signed up organically and hasn't joined anything yet.
//     Run this before join for the "existing user gets invited" flow (E's flow).
//     For the "invite creates account + joins in one step" flow (D's flow), skip
//     this and go straight to join — it will create the user automatically.
//
//   node scripts/test.mjs join --player <A-E> --invite <url-or-token>
//     Join a league via invite link or raw token.
//     If the player has no saved ID (e.g. D, first time): creates account + joins.
//     If the player already has a saved ID (e.g. E after create-user): just joins.
//
//   node scripts/test.mjs advance --round <id> [--subs-close <s>] [--vote-close <s>]
//     Set round deadlines relative to now. Pass at least one flag; only the
//     flags you pass are updated, the others are left untouched.
//     --subs-close  seconds until submissions close
//     --vote-close  seconds until voting closes
//
//   node scripts/test.mjs submit --player <A-E> --round <id>
//     Submit the player's hardcoded fixture tracks (FIXTURE_TRACKS).
//     Every field including apple_music_id is baked in — no external lookups.
//
//   node scripts/test.mjs vote --player <A-E> --round <id>
//     Distribute points randomly and leave a comment.
//
//   node scripts/test.mjs close-voting [--round <id>]
//     Force the close_voting_rounds() RPC to run (same work as the cron tick).
//     Marks non-voter round_participants as is_void and voids their incoming
//     votes. If --round is given, also short-circuits voting_deadline_at = now()
//     so the round is unambiguously past its deadline before close runs.
//
//   node scripts/test.mjs round-results --round <id>
//     Dump the output of get_round_results for quick verification that
//     forfeits sort to the bottom with points_effective = 0.
//
// Setup: copy scripts/.env.test.example → scripts/.env.test and fill in values.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const __dir = dirname(fileURLToPath(import.meta.url));
const ENV_PATH  = join(__dir, '.env.test');
const STATE_PATH = join(__dir, '.test-state.json');

// ─── Player config ────────────────────────────────────────────────────────────

// A, B, C are the core players created via setup-players.
// D and E are reserve players for mid-season / join-flow testing.
const PLAYERS = {
  A: { name: 'Player A', email: 'player-a@test.mix', genre: 'hip-hop' },
  B: { name: 'Player B', email: 'player-b@test.mix', genre: 'rock' },
  C: { name: 'Player C', email: 'player-c@test.mix', genre: 'pop' },
  D: { name: 'Player D', email: 'player-d@test.mix', genre: 'electronic' },
  E: { name: 'Player E', email: 'player-e@test.mix', genre: 'jazz' },
};

// D and E excluded from setup-players — only created on demand
const CORE_PLAYERS = ['A', 'B', 'C'];

const COMMENTS = {
  A: ['hard', 'this slaps', 'bars on bars', 'fire', 'no skip'],
  B: ['riff is insane', 'heavy', 'classic vibes', 'banger', 'guitar gods'],
  C: ['so catchy', 'love the hook', "can't stop listening", 'perfect pop', 'earworm'],
  D: ['the drop is everything', 'certified banger', 'pure energy', 'this one goes off', 'dark and deep'],
  E: ['smooth', 'late night vibes', 'the chord changes', 'real musicianship', 'this is art'],
  andrea: ['obsessed', 'this is everything', 'certified classic', 'the vibe is immaculate', 'on repeat'],
};

const DEFAULT_GENRE = 'pop';

// ─── Hardcoded fixture tracks ─────────────────────────────────────────────────
//
// Each stock player (A–E) submits from a fixed pool. `submit` takes the first N
// tracks from the player's pool, where N = round's submissions_per_user.
//
// PASTE REAL IDS HERE. Every field must correspond to a real track — if the
// IDs don't match, Apple Music will play whatever it thinks the appleMusicId
// points to (which will look nothing like the artwork/title/artist shown).
//
// How to fill each field:
//   spotifyTrackId  Spotify → Share → Copy Song Link → last URL segment
//   appleMusicId    Apple Music → Share → Copy Link → ?i=<this>
//   isrc            Spotify Web API `/v1/tracks/{id}` → external_ids.isrc
//                   or use songwhip.com and paste the Spotify URL
//   artworkUrl      Any square album art URL (the app renders it as-is)
//   durationMs      Track length in milliseconds
//
// Format template (Frank Ocean — Nights, verified working example):
//   {
//     spotifyTrackId: '7eqoqGkKwgOaWNNHx90uEZ',
//     appleMusicId:   '1146195720',
//     isrc:           'QZ5C81600009',
//     title:          'Nights',
//     artist:         'Frank Ocean',
//     albumName:      'Blonde',
//     artworkUrl:     'https://i.scdn.co/image/ab67616d0000b273c5649add07ed3720be9d5526',
//     durationMs:     307151,
//   }
const FIXTURE_TRACKS = {
  A: [
    // Frank Ocean — Nights (verified: spotifyId + appleMusicId + isrc from real data)
    {
      spotifyTrackId: '7eqoqGkKwgOaWNNHx90uEZ',
      appleMusicId: '1146195720',
      isrc: 'QZ5C81600009',
      title: 'Nights',
      artist: 'Frank Ocean',
      albumName: 'Blonde',
      artworkUrl: 'https://i.scdn.co/image/ab67616d0000b273c5649add07ed3720be9d5526',
      durationMs: 307151,
    },
  ],
  B: [
    // Kendrick Lamar — Alright (spotifyId + appleMusicId verified via oembed / iTunes lookup;
    // ISRC synthesized — unique per fixture, unused by playback)
    {
      spotifyTrackId: '3iVcZ5G6tvkXZkZKlMpIUs',
      appleMusicId: '1440871886',
      isrc: 'USTST2600002',
      title: 'Alright',
      artist: 'Kendrick Lamar',
      albumName: 'To Pimp a Butterfly',
      artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/b5/a6/91/b5a69171-5232-3d5b-9c15-8963802f83dd/15UMGIM15814.rgb.jpg/600x600bb.jpg',
      durationMs: 219337,
    },
  ],
  C: [
    // Fleetwood Mac — Dreams (2004 Remaster on Spotify, same song on Apple Music)
    {
      spotifyTrackId: '0ofHAoxe9vBkTCp2UQIavz',
      appleMusicId: '594061856',
      isrc: 'USTST2600003',
      title: 'Dreams',
      artist: 'Fleetwood Mac',
      albumName: 'Rumours',
      artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/4d/13/ba/4d13bac3-d3d5-7581-2c74-034219eadf2b/081227970949.jpg/600x600bb.jpg',
      durationMs: 257800,
    },
  ],
  D: [
    // Amy Winehouse — Back to Black
    {
      spotifyTrackId: '30FURVTCpbKyykjSEQzGkH',
      appleMusicId: '1440856228',
      isrc: 'USTST2600004',
      title: 'Back to Black',
      artist: 'Amy Winehouse',
      albumName: 'Back to Black',
      artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/cf/3f/09/cf3f0994-980d-d8ed-088d-ae89af256b73/15UMGIM24224.rgb.jpg/600x600bb.jpg',
      durationMs: 241293,
    },
  ],
  E: [
    // Daft Punk — Get Lucky (feat. Pharrell Williams and Nile Rodgers)
    {
      spotifyTrackId: '3fDDsZoNKTvm2zj6gmfD2H',
      appleMusicId: '617154366',
      isrc: 'USTST2600005',
      title: 'Get Lucky',
      artist: 'Daft Punk, Pharrell Williams, Nile Rodgers',
      albumName: 'Random Access Memories',
      artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/e8/43/5f/e8435ffa-b6b9-b171-40ab-4ff3959ab661/886443919266.jpg/600x600bb.jpg',
      durationMs: 369629,
    },
  ],
};

// ─── Known real users (hardcoded IDs) ────────────────────────────────────────

const KNOWN_USERS = {
  victor: { id: '10429dd2-c524-487e-a0ab-b5c7d8a7aa16', name: 'Victor' },
  andrea: { id: '85676018-2dc1-42a0-a5d7-befb37f83fb8', name: 'Andrea' }
  // john: add via `register-player --name john --id <uuid>` then it resolves from state
};

// Players always added to every seeded league.
// E is a spectator (can view but doesn't submit or vote).
const FIXTURE_PLAYERS = [
  { key: 'A', id: 'bb6d5f68-1937-4df7-864b-08cc89c48957', role: 'participant' },
  { key: 'B', id: '356997da-bd00-46a6-9c1a-2d82da06af28', role: 'participant' },
  { key: 'C', id: '24f3d556-5dec-4b6e-9255-1000c0839c57', role: 'participant' },
  { key: 'D', id: '0287b775-c461-4357-aadc-849a088d0a8c', role: 'participant' },
  { key: 'E', id: 'b3dadc59-fcdb-4bd8-907b-66a644c46f99', role: 'spectator' },
];

// Prompts are shown in the UI as "sounds like: <prompt>" — keep them ≤20 chars.
const ROUND_FIXTURES = [
  { prompt: 'a long drive',        description: 'Windows down, no destination. Pick the song that makes three hours disappear.' },
  { prompt: 'summer ending',       description: 'The last warm weekend, the last festival set — pick the track that captures that specific ache.' },
  { prompt: 'being 14',            description: 'The song that defined a specific, embarrassing, formative era. No judgment — we\'ve all been there.' },
  { prompt: 'a city at night',     description: 'Streetlights, late trains, empty streets. Pick the track that scores that particular atmosphere.' },
  { prompt: 'reading in bed',      description: 'That slow, late-night quiet. Pick the track you\'d put on while you disappear into a book.' },
  { prompt: 'being understood',    description: 'That rare song where someone got it exactly right — the feeling you couldn\'t put into words.' },
  { prompt: 'a one-hit wonder',    description: 'One song. One moment. Gone forever. Pick the track that deserved more than it got.' },
  { prompt: 'a first dance',       description: 'The song you\'d pick for the moment everyone\'s watching. Make it count.' },
  { prompt: 'your parents hate it',description: 'The track that got the aux cord yanked or earned you a look. Own it.' },
  { prompt: 'growing up too fast', description: 'A song that captures the strange weight of moving on before you were ready.' },
];

// ─── Env + state ─────────────────────────────────────────────────────────────

function loadEnv() {
  if (!existsSync(ENV_PATH)) {
    console.error('Missing scripts/.env.test — copy .env.test.example and fill it in');
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!env[key]) { console.error(`Missing ${key} in .env.test`); process.exit(1); }
  }
  return env;
}

function loadState() {
  return existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : {};
}

function saveState(s) {
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      args[tok.slice(2)] = argv[i + 1] ?? true;
      i++;
    } else if (tok.startsWith('-') && tok.length > 1) {
      // Lenient: accept single-dash form too (e.g. -vote-close 2)
      args[tok.slice(1)] = argv[i + 1] ?? true;
      i++;
    } else {
      console.error(`Unrecognized argument: "${tok}" (expected --flag value)`);
      process.exit(1);
    }
  }
  return args;
}

// ─── Supabase REST ────────────────────────────────────────────────────────────

async function sb(env, path, method = 'GET', body = null, extraHeaders = {}) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extraHeaders,
  };
  const res = await fetch(`${env.SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

// ─── Point distribution ───────────────────────────────────────────────────────

// Deterministic: fill submissions in order, giving each up to maxPerTrack until
// total is exhausted. Same voter + same round layout = same vote every time.
function distributePoints(total, count, maxPerTrack) {
  const pts = new Array(count).fill(0);
  let remaining = total;
  for (let i = 0; i < count && remaining > 0; i++) {
    const give = Math.min(maxPerTrack, remaining);
    pts[i] = give;
    remaining -= give;
  }
  return pts;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function setupPlayers(env, args) {
  let leagueId = args.league;
  // Convenience: accept --season <id> and resolve to its league. Saves a
  // separate lookup when you just got a season id from somewhere and want
  // A/B/C added to whichever league it belongs to.
  if (!leagueId && args.season) {
    const seasonRes = await sb(
      env,
      `/rest/v1/seasons?id=eq.${args.season}&select=league_id&limit=1`,
    );
    leagueId = seasonRes.data?.[0]?.league_id;
    if (!leagueId) {
      console.error(`Could not find league for season ${args.season}`);
      process.exit(1);
    }
    console.log(`Resolved season ${args.season} → league ${leagueId}`);
  }
  if (!leagueId) {
    console.error('Usage: setup-players --league <id> | --season <id>');
    process.exit(1);
  }

  const state = loadState();
  if (!state.players) state.players = {};

  for (const key of CORE_PLAYERS) {
    const player = PLAYERS[key];
    console.log(`\nSetting up Player ${key} (${player.name})...`);

    let userId = state.players[key];

    if (userId) {
      console.log(`  Already created — using saved ID: ${userId}`);
    } else {
      // First time: create auth user
      const createRes = await sb(env, '/auth/v1/admin/users', 'POST', {
        email: player.email,
        password: 'TestPassword123!',
        email_confirm: true,
      });

      if (createRes.ok && createRes.data?.id) {
        userId = createRes.data.id;
        console.log(`  ✓ Auth user created: ${userId}`);
      } else {
        console.error(`  Failed to create auth user for Player ${key}.`);
        console.error(`  Response:`, createRes.data);
        process.exit(1);
      }

      state.players[key] = userId;

      // Upsert into public.users
      await sb(env, '/rest/v1/users', 'POST', { id: userId, display_name: player.name },
        { Prefer: 'resolution=merge-duplicates,return=representation' });
    }

    // Add to league_members (ignore if already there)
    const memberRes = await sb(env, '/rest/v1/league_members', 'POST',
      { league_id: leagueId, user_id: userId, role: 'participant' },
      { Prefer: 'resolution=ignore-duplicates,return=representation' });

    if (memberRes.ok || memberRes.status === 409) {
      console.log(`  ✓ Added to league`);
    } else {
      console.warn(`  League member insert warning:`, memberRes.data);
    }
  }

  state.leagueId = leagueId;
  saveState(state);
  console.log('\n✓ Done. Player IDs saved to scripts/.test-state.json');
}

// ─── Seed league ──────────────────────────────────────────────────────────────

async function addMember(env, leagueId, userId, role) {
  const res = await sb(
    env,
    '/rest/v1/league_members',
    'POST',
    { league_id: leagueId, user_id: userId, role },
    { Prefer: 'resolution=ignore-duplicates,return=representation' },
  );
  if (!res.ok && res.status !== 409) {
    console.warn(`  Warning: could not add member ${userId} (${role}):`, JSON.stringify(res.data));
  }
}

// seed-league: create a fresh league + season + N rounds in one command.
// Round 1 is immediately live for submissions; rounds 2–N have staggered
// future deadlines (2 weeks each, back-to-back).
//
// Usage:
//   node scripts/test.mjs seed-league --commissioner victor
//   node scripts/test.mjs seed-league --commissioner andrea
//   node scripts/test.mjs seed-league --commissioner <uuid>
//   node scripts/test.mjs seed-league --commissioner victor --name "Summer Jams" --rounds 5
async function seedLeague(env, args) {
  const commissionerArg = args.commissioner?.toLowerCase();
  if (!commissionerArg) {
    console.error('Usage: seed-league --commissioner <victor|andrea|uuid> [--name <league-name>] [--rounds <n>]');
    process.exit(1);
  }

  // Resolve commissioner: hardcoded map → state → bare UUID
  let commissionerId;
  let commissionerLabel;
  if (KNOWN_USERS[commissionerArg]) {
    commissionerId = KNOWN_USERS[commissionerArg].id;
    commissionerLabel = KNOWN_USERS[commissionerArg].name;
  } else {
    const state = loadState();
    const stateId = state.players?.[commissionerArg];
    if (stateId) {
      commissionerId = stateId;
      commissionerLabel = commissionerArg;
    } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(commissionerArg)) {
      commissionerId = commissionerArg;
      commissionerLabel = commissionerArg;
    } else {
      console.error(`Unknown commissioner "${commissionerArg}". Add to KNOWN_USERS or run register-player first.`);
      process.exit(1);
    }
  }

  const leagueName = args.name ?? `${commissionerLabel}'s League`;
  const roundCount = Math.max(1, parseInt(args.rounds ?? '10', 10));

  console.log(`\nSeeding league "${leagueName}"...`);
  console.log(`  Commissioner: ${commissionerLabel} (${commissionerId})`);
  console.log(`  Rounds: ${roundCount}`);

  // 1. Create league — admin_user_id identifies the commissioner; RLS uses this.
  const leagueRes = await sb(env, '/rest/v1/leagues', 'POST', {
    name: leagueName,
    admin_user_id: commissionerId,
  });
  if (!leagueRes.ok) { console.error('League creation failed:', leagueRes.data); process.exit(1); }
  const league = Array.isArray(leagueRes.data) ? leagueRes.data[0] : leagueRes.data;
  console.log(`\n✓ League:  ${league.id}`);

  // 2. Create season — invite_token auto-generates via gen_random_uuid() default.
  const seasonRes = await sb(env, '/rest/v1/seasons', 'POST', {
    league_id: league.id,
    name: 'Season 1',
    season_number: 1,
  });
  if (!seasonRes.ok) { console.error('Season creation failed:', seasonRes.data); process.exit(1); }
  const season = Array.isArray(seasonRes.data) ? seasonRes.data[0] : seasonRes.data;
  console.log(`✓ Season:  ${season.id}`);
  console.log(`  Invite:  mix://join?token=${season.invite_token}`);

  // 3. Add members.
  // Commissioner is a regular participant in league_members; admin status is on leagues.admin_user_id.
  console.log(`\nAdding members...`);
  await addMember(env, league.id, commissionerId, 'participant');
  console.log(`  ✓ ${commissionerLabel} (commissioner / participant)`);
  for (const p of FIXTURE_PLAYERS) {
    await addMember(env, league.id, p.id, p.role);
    console.log(`  ✓ Player ${p.key} (${p.role})`);
  }
  for (const [name, user] of Object.entries(KNOWN_USERS)) {
    if (user.id === commissionerId) continue;
    await addMember(env, league.id, user.id, 'participant');
    console.log(`  ✓ ${user.name} (known user / participant)`);
  }

  // 4. Create rounds.
  // Round 1: submissions open now, closes in 7 days; voting closes in 14 days.
  // Round N (N > 1): each subsequent round starts the day after the previous
  //   voting period ends, runs for 7 days of submissions + 7 days of voting.
  console.log(`\nCreating ${roundCount} round(s)...`);
  const now = Date.now();
  const DAY = 86_400_000;
  const roundIds = [];

  for (let i = 0; i < roundCount; i++) {
    const rn = i + 1;
    const fixture = ROUND_FIXTURES[i % ROUND_FIXTURES.length];
    // R1 submissions open from now; each round is 14 days, stacked back-to-back.
    const subsCloseMs = now + ((rn - 1) * 14 + 7) * DAY;
    const voteCloseMs = now + (rn * 14) * DAY;

    const roundRes = await sb(env, '/rest/v1/rounds', 'POST', {
      season_id: season.id,
      round_number: rn,
      prompt: fixture.prompt,
      description: fixture.description,
      submission_deadline_at: new Date(subsCloseMs).toISOString(),
      voting_deadline_at: new Date(voteCloseMs).toISOString(),
    });
    if (!roundRes.ok) {
      console.error(`  ✗ Round ${rn} failed:`, roundRes.data);
      continue;
    }
    const round = Array.isArray(roundRes.data) ? roundRes.data[0] : roundRes.data;
    roundIds.push(round.id);
    const marker = rn === 1 ? ' ← LIVE' : '';
    console.log(`  ✓ R${String(rn).padStart(2, '0')} "sounds like: ${fixture.prompt}"${marker}`);
  }

  // Persist to state so subsequent commands can reference without copy-pasting IDs.
  const state = loadState();
  state.lastSeedLeague = { leagueId: league.id, seasonId: season.id, roundIds, inviteToken: season.invite_token };
  saveState(state);

  console.log(`\n✓ Done.`);
  console.log(`  League ID:       ${league.id}`);
  console.log(`  Season ID:       ${season.id}`);
  console.log(`  Active round:    ${roundIds[0] ?? 'n/a'}`);
  console.log(`  Invite link:     mix://join?token=${season.invite_token}`);
  console.log(`\n  IDs saved to scripts/.test-state.json under lastSeedLeague.`);
}

async function advanceRound(env, args) {
  const roundId = args.round;
  if (!roundId) { console.error('Usage: advance --round <id> [--subs-close <s>] [--vote-close <s>]'); process.exit(1); }

  const hasSubs = args['subs-close'] !== undefined;
  const hasVote = args['vote-close'] !== undefined;
  if (!hasSubs && !hasVote) {
    console.error('advance: pass at least one of --subs-close <s> or --vote-close <s>');
    process.exit(1);
  }

  const patch = {};
  let subMsg = null;
  let voteMsg = null;

  if (hasSubs) {
    const secs = parseInt(args['subs-close'], 10);
    if (Number.isNaN(secs)) { console.error('--subs-close must be a number of seconds'); process.exit(1); }
    const iso = new Date(Date.now() + secs * 1000).toISOString();
    patch.submission_deadline_at = iso;
    subMsg = `Submissions close in ${secs}s  →  ${iso}`;
  }

  if (hasVote) {
    const secs = parseInt(args['vote-close'], 10);
    if (Number.isNaN(secs)) { console.error('--vote-close must be a number of seconds'); process.exit(1); }
    const iso = new Date(Date.now() + secs * 1000).toISOString();
    patch.voting_deadline_at = iso;
    voteMsg = `Voting closes in    ${secs}s  →  ${iso}`;
  }

  const res = await sb(env, `/rest/v1/rounds?id=eq.${roundId}`, 'PATCH', patch);

  if (res.ok) {
    console.log(`✓ Round updated`);
    if (subMsg) console.log(`  ${subMsg}`);
    if (voteMsg) console.log(`  ${voteMsg}`);
  } else {
    console.error('Failed:', res.data);
    process.exit(1);
  }
}

async function submitForPlayer(env, args) {
  const key = args.player?.toUpperCase();
  const rawKey = args.player;
  const roundId = args.round;
  if (!rawKey || !roundId) { console.error('Usage: submit --player <A|B|C|D|E> --round <id>'); process.exit(1); }

  const state = loadState();
  const userId = state.players?.[key] ?? state.players?.[rawKey.toLowerCase()];
  if (!userId) { console.error(`No saved ID for player "${rawKey}" — run register-player or setup-players first`); process.exit(1); }

  const pool = FIXTURE_TRACKS[key];
  if (!pool || pool.length === 0) {
    console.error(`No FIXTURE_TRACKS defined for player "${key}". Add entries to FIXTURE_TRACKS in scripts/test.mjs.`);
    process.exit(1);
  }

  // Get round → season info to know how many submissions to insert.
  const roundRes = await sb(env, `/rest/v1/rounds?id=eq.${roundId}&select=*,seasons(submissions_per_user)`);
  const round = roundRes.data?.[0];
  if (!round) { console.error('Round not found'); process.exit(1); }
  const limit = round.seasons?.submissions_per_user ?? 1;

  if (pool.length < limit) {
    console.warn(`  Player ${key} has ${pool.length} fixture track(s) but round expects ${limit}. Submitting ${pool.length}.`);
  }

  const rows = pool.slice(0, limit).map((t) => ({
    round_id: roundId,
    user_id: userId,
    track_source: 'spotify',
    spotify_track_id: t.spotifyTrackId,
    apple_music_id: t.appleMusicId,
    track_isrc: t.isrc,
    track_title: t.title,
    track_artist: t.artist,
    track_album_name: t.albumName,
    track_artwork_url: t.artworkUrl,
    track_duration_ms: t.durationMs,
    track_popularity: null,
    comment: null,
  }));

  const insertRes = await sb(env, '/rest/v1/submissions', 'POST', rows.length === 1 ? rows[0] : rows);
  if (insertRes.ok) {
    rows.forEach((r) => console.log(`  ✓ ${r.track_title} — ${r.track_artist}`));
  } else {
    console.error('Submission failed:', insertRes.data);
    process.exit(1);
  }
}

async function voteForPlayer(env, args) {
  const key = args.player?.toUpperCase();
  const rawKey = args.player; // preserve original casing for named players
  const roundId = args.round;
  if (!rawKey || !roundId) { console.error('Usage: vote --player <A|B|C|andrea|...> --round <id>'); process.exit(1); }

  const state = loadState();
  // Named players (e.g. andrea) are stored in state.players by their name (lowercase)
  const userId = state.players?.[key] ?? state.players?.[rawKey.toLowerCase()];
  if (!userId) { console.error(`No saved ID for player "${rawKey}" — run register-player or setup-players first`); process.exit(1); }

  // Get round → season points config
  const roundRes = await sb(env, `/rest/v1/rounds?id=eq.${roundId}&select=*,seasons(default_points_per_round,default_max_points_per_track)`);
  const round = roundRes.data?.[0];
  if (!round) { console.error('Round not found'); process.exit(1); }
  const totalPoints = round.seasons?.default_points_per_round ?? 10;
  const maxPerTrack = round.seasons?.default_max_points_per_track ?? 5;

  // Get submissions to vote on (exclude own). Order by id so votes are stable
  // across runs — same voter always sees submissions in the same order.
  const subsRes = await sb(env, `/rest/v1/submissions?round_id=eq.${roundId}&user_id=neq.${userId}&select=id&order=id.asc`);
  const subs = subsRes.data ?? [];
  if (subs.length === 0) { console.error('No submissions to vote on for this player'); process.exit(1); }

  // Deterministic point distribution — fills submissions in order up to maxPerTrack.
  // The votes table has a `points > 0` check, so drop any zero-point rows.
  const pts = distributePoints(totalPoints, subs.length, maxPerTrack);
  const votes = subs
    .map((s, i) => ({ submission_id: s.id, points: pts[i] }))
    .filter((v) => v.points > 0);
  if (votes.length === 0) { console.error('No positive-point votes to submit'); process.exit(1); }

  // Call submit_votes RPC
  const rpcRes = await sb(env, '/rest/v1/rpc/submit_votes', 'POST', {
    p_round_id: roundId,
    p_voter_user_id: userId,
    p_votes: votes,
  });

  if (rpcRes.ok) {
    votes.forEach((v) => console.log(`  ✓ ${v.points} pts → ${v.submission_id}`));
  } else {
    console.error('Vote failed:', rpcRes.data);
    process.exit(1);
  }

  // Leave a fixed comment on the first submission — deterministic across runs.
  const commentPool = COMMENTS[key] ?? COMMENTS[rawKey.toLowerCase()] ?? ['great track'];
  const commentText = commentPool[0];
  const targetSub = subs[0];
  const commentRes = await sb(env, '/rest/v1/comments', 'POST', {
    round_id: roundId,
    submission_id: targetSub.id,
    author_user_id: userId,
    body: commentText,
  });
  if (commentRes.ok) {
    console.log(`  ✓ Comment: "${commentText}"`);
  }
}

// Shared helper: create auth user + public.users entry, save to state
async function createAuthUser(env, state, key) {
  const player = PLAYERS[key];
  const createRes = await sb(env, '/auth/v1/admin/users', 'POST', {
    email: player.email,
    password: 'TestPassword123!',
    email_confirm: true,
  });

  if (!createRes.ok || !createRes.data?.id) {
    console.error(`  Failed to create auth user for Player ${key}:`, createRes.data);
    process.exit(1);
  }

  const userId = createRes.data.id;
  await sb(env, '/rest/v1/users', 'POST', { id: userId, display_name: player.name },
    { Prefer: 'resolution=merge-duplicates,return=representation' });

  state.players[key] = userId;
  saveState(state);
  return userId;
}

async function createUser(env, args) {
  const key = args.player?.toUpperCase();
  if (!key) { console.error('Usage: create-user --player <D|E>'); process.exit(1); }
  if (!PLAYERS[key]) { console.error(`Unknown player "${key}".`); process.exit(1); }

  const state = loadState();
  if (!state.players) state.players = {};

  if (state.players[key]) {
    console.log(`Player ${key} already exists (${state.players[key]}) — nothing to do.`);
    return;
  }

  console.log(`Creating Player ${key} (${PLAYERS[key].name}) with no league...`);
  const userId = await createAuthUser(env, state, key);
  console.log(`✓ Player ${key} created: ${userId}`);
  console.log(`  No league joined. Run join when ready to invite them.`);
}

async function joinForPlayer(env, args) {
  const key = args.player?.toUpperCase();
  const inviteArg = args.invite;
  if (!key || !inviteArg) { console.error('Usage: join --player <A|B|C|D|E> --invite <url-or-token>'); process.exit(1); }
  if (!PLAYERS[key]) { console.error(`Unknown player "${key}". Use A–E.`); process.exit(1); }

  const state = loadState();
  if (!state.players) state.players = {};

  let userId = state.players[key];

  if (userId) {
    // Warm join: user already exists (e.g. E who signed up earlier)
    console.log(`Player ${key} already exists (${userId}) — joining league directly.`);
  } else {
    // Cold join: no account yet — create user first, then join (e.g. D's flow)
    console.log(`Player ${key} has no account yet — creating one before joining...`);
    userId = await createAuthUser(env, state, key);
    console.log(`  ✓ Auth user created: ${userId}`);
  }

  // Extract UUID token from a full URL or accept a bare UUID
  const tokenMatch = inviteArg.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!tokenMatch) { console.error('Could not find a UUID token in the provided invite value'); process.exit(1); }
  const token = tokenMatch[0];

  // Resolve league + season via RPC
  const infoRes = await sb(env, '/rest/v1/rpc/get_join_invite_info', 'POST', { invite_token: token });
  const info = Array.isArray(infoRes.data) ? infoRes.data[0] : infoRes.data;
  if (!info?.league_id) {
    console.error('Invalid or expired invite token');
    console.error(infoRes.data);
    process.exit(1);
  }

  console.log(`Joining "${info.league_name}" / "${info.season_name}" as Player ${key}...`);

  const memberRes = await sb(env, '/rest/v1/league_members', 'POST',
    { league_id: info.league_id, user_id: userId, role: 'participant' },
    { Prefer: 'resolution=ignore-duplicates,return=representation' });

  if (memberRes.ok || memberRes.status === 409) {
    console.log(`  ✓ Player ${key} joined league ${info.league_id}`);
  } else {
    console.error('Failed:', memberRes.data);
    process.exit(1);
  }
}

async function closeVoting(env, args) {
  const roundId = args.round;

  if (roundId) {
    const nowIso = new Date().toISOString();
    const bump = await sb(env, `/rest/v1/rounds?id=eq.${roundId}`, 'PATCH', {
      voting_deadline_at: nowIso,
    });
    if (!bump.ok) {
      console.error('Failed to bump voting_deadline_at:', bump.data);
      process.exit(1);
    }
    console.log(`✓ Round ${roundId} voting_deadline_at set to now()`);
  }

  const rpcRes = await sb(env, '/rest/v1/rpc/close_voting_rounds', 'POST', {});
  if (!rpcRes.ok) {
    console.error('close_voting_rounds RPC failed:', rpcRes.data);
    process.exit(1);
  }
  console.log('✓ close_voting_rounds() ran');
}

async function roundResults(env, args) {
  const roundId = args.round;
  if (!roundId) { console.error('Usage: round-results --round <id>'); process.exit(1); }

  const rpcRes = await sb(env, '/rest/v1/rpc/get_round_results', 'POST', { p_round_id: roundId });
  if (!rpcRes.ok) {
    console.error('get_round_results RPC failed:', rpcRes.data);
    process.exit(1);
  }

  const rows = Array.isArray(rpcRes.data) ? rpcRes.data : [];
  if (rows.length === 0) {
    console.log('No submissions for this round.');
    return;
  }

  console.log(`\nRound ${roundId} — ${rows.length} submission(s)\n`);
  console.log('status  points  effective  submitter           track');
  console.log('------  ------  ---------  -------------------  --------------------');
  let rank = 0;
  rows.forEach((r) => {
    const status = r.is_void ? 'VOID  ' : `#${String(++rank).padEnd(5)}`;
    const raw = String(r.points_raw).padStart(6);
    const eff = String(r.points_effective).padStart(9);
    const name = (r.display_name ?? '').padEnd(19).slice(0, 19);
    const track = `${r.track_title} — ${r.track_artist}`.slice(0, 40);
    console.log(`${status}  ${raw}  ${eff}  ${name}  ${track}`);
  });
  console.log('');
}

// ─── Entry ────────────────────────────────────────────────────────────────────

const [,, command, ...rest] = process.argv;
const args = parseArgs(rest);
const env = loadEnv();

// register-player: seed a real user's ID into state so they can be used with
// submit/vote commands by name (e.g. --player andrea).
// Usage: node scripts/test.mjs register-player --name andrea --id <uuid>
async function registerPlayer(env, args) {
  const name = args.name?.toLowerCase();
  const id = args.id;
  if (!name || !id) { console.error('Usage: register-player --name <name> --id <uuid>'); process.exit(1); }
  const state = loadState();
  state.players = state.players ?? {};
  state.players[name] = id;
  saveState(state);
  console.log(`✓ Registered "${name}" → ${id}`);
}

// sync-state: write fixture player IDs and known user IDs into state so
// submit/vote commands work without running setup-players. Safe to run any
// time — just overwrites those keys, leaves the rest of state alone.
// Usage: node scripts/test.mjs sync-state
async function syncState(env, args) {
  const state = loadState();
  state.players = state.players ?? {};
  for (const p of FIXTURE_PLAYERS) {
    state.players[p.key.toLowerCase()] = p.id;
  }
  for (const [name, user] of Object.entries(KNOWN_USERS)) {
    state.players[name] = user.id;
  }
  saveState(state);
  console.log('✓ state.players synced:');
  for (const [k, v] of Object.entries(state.players)) {
    console.log(`  ${k}: ${v}`);
  }
}

// add-member: add a known user to a league by name.
// Usage: node scripts/test.mjs add-member --name andrea --league <id>
async function addKnownMember(env, args) {
  const name = args.name?.toLowerCase();
  const leagueId = args.league;
  if (!name || !leagueId) {
    console.error('Usage: add-member --name <name> --league <id>');
    process.exit(1);
  }
  const user = KNOWN_USERS[name];
  if (!user) {
    console.error(`Unknown user "${name}". Add to KNOWN_USERS first.`);
    process.exit(1);
  }
  await addMember(env, leagueId, user.id, 'participant');
  console.log(`✓ ${user.name} added to league ${leagueId} as participant`);
}

// ─── Active round / rounds list ──────────────────────────────────────────────

// Shared internal: same selection as activeRound below + the app's
// getActiveRoundForLeague. Returns { season, round } or { season, round: null }
// when the season exists but no rounds are open. Exits the process with a
// useful message if the league has no active season — callers can assume the
// returned shape is valid.
async function getActiveSeasonAndRound(env, leagueId) {
  const nowIso = new Date().toISOString();
  const seasonRes = await sb(
    env,
    `/rest/v1/seasons?select=id,name&league_id=eq.${leagueId}&status=eq.active&limit=1`,
  );
  if (!seasonRes.ok) {
    console.error('Season lookup failed:', seasonRes.data);
    process.exit(1);
  }
  const season = seasonRes.data?.[0];
  if (!season) {
    console.error(`No active season for league ${leagueId}`);
    process.exit(1);
  }
  const roundRes = await sb(
    env,
    `/rest/v1/rounds?select=id,round_number,prompt,submission_deadline_at,voting_deadline_at&season_id=eq.${season.id}&voting_deadline_at=gt.${encodeURIComponent(nowIso)}&order=round_number.asc&limit=1`,
  );
  if (!roundRes.ok) {
    console.error('Round lookup failed:', roundRes.data);
    process.exit(1);
  }
  return { season, round: roundRes.data?.[0] ?? null };
}

// Mirrors the app's `getActiveRoundForLeague` selection: first round in the
// active season whose voting hasn't closed yet, ordered by round_number asc.
// Prints round id, number, prompt, and both deadlines so you can see which
// round the home page will be showing — and whether the previous round still
// blocks new submissions (look at the voting_deadline_at vs now).
async function activeRound(env, args) {
  const leagueId = args.league;
  if (!leagueId) {
    console.error('Usage: node scripts/test.mjs active-round --league <id>');
    process.exit(1);
  }
  const { season, round } = await getActiveSeasonAndRound(env, leagueId);
  console.log(`Active season: ${season.name} (${season.id})`);
  if (!round) {
    console.log('No active round (all rounds in this season have closed).');
    return;
  }
  console.log(`Active round:`);
  console.log(`  id:                    ${round.id}`);
  console.log(`  round_number:          ${round.round_number}`);
  console.log(`  prompt:                ${round.prompt}`);
  console.log(`  submission_deadline:   ${round.submission_deadline_at}`);
  console.log(`  voting_deadline:       ${round.voting_deadline_at}`);
}

// Run submit for players A, B, C against the league's active round. Convenience
// wrapper — equivalent to looking up the active round and running submit three
// times. Skips any player that errors so one missing player doesn't block the
// rest of the batch.
async function allSubmit(env, args) {
  const leagueId = args.league;
  if (!leagueId) {
    console.error('Usage: all-submit --league <id>');
    process.exit(1);
  }
  const { round } = await getActiveSeasonAndRound(env, leagueId);
  if (!round) {
    console.error('No active round to submit to.');
    process.exit(1);
  }
  console.log(`Active round: R${round.round_number} (${round.id})`);
  for (const key of CORE_PLAYERS) {
    console.log(`\n[Player ${key}] submitting…`);
    try {
      await submitForPlayer(env, { player: key, round: round.id });
    } catch (e) {
      console.error(`  ✗ Player ${key} submit failed:`, e?.message ?? e);
    }
  }
}

// Run vote for players A, B, C against the league's active round.
async function allVote(env, args) {
  const leagueId = args.league;
  if (!leagueId) {
    console.error('Usage: all-vote --league <id>');
    process.exit(1);
  }
  const { round } = await getActiveSeasonAndRound(env, leagueId);
  if (!round) {
    console.error('No active round to vote on.');
    process.exit(1);
  }
  console.log(`Active round: R${round.round_number} (${round.id})`);
  for (const key of CORE_PLAYERS) {
    console.log(`\n[Player ${key}] voting…`);
    try {
      await voteForPlayer(env, { player: key, round: round.id });
    } catch (e) {
      console.error(`  ✗ Player ${key} vote failed:`, e?.message ?? e);
    }
  }
}

// Fetch the season's invite_token and print the mix:// join link. Same format
// the league screen's Share button uses — paste it into the device's clipboard
// and the deep-link handler in app/_layout.tsx will route to the join screen.
async function inviteLink(env, args) {
  const seasonId = args.season;
  if (!seasonId) {
    console.error('Usage: invite-link --season <id>');
    process.exit(1);
  }
  const res = await sb(
    env,
    `/rest/v1/seasons?id=eq.${seasonId}&select=name,league_id,invite_token&limit=1`,
  );
  if (!res.ok) {
    console.error('Season lookup failed:', res.data);
    process.exit(1);
  }
  const season = res.data?.[0];
  if (!season) {
    console.error(`Season ${seasonId} not found.`);
    process.exit(1);
  }
  if (!season.invite_token) {
    console.error('Season has no invite_token.');
    process.exit(1);
  }
  console.log(`Season:  ${season.name}`);
  console.log(`League:  ${season.league_id}`);
  console.log(`Invite:  mix://join?token=${season.invite_token}`);
}

// Dump all rounds in a season with their phase. Handy when "Previous round
// is still in progress" trips you up — find the round whose voting hasn't
// closed and either advance --vote-close 0 it or close-voting --round <id>.
async function listRounds(env, args) {
  const seasonId = args.season;
  if (!seasonId) {
    console.error('Usage: node scripts/test.mjs rounds --season <id>');
    process.exit(1);
  }
  const res = await sb(
    env,
    `/rest/v1/rounds?select=id,round_number,prompt,submission_deadline_at,voting_deadline_at&season_id=eq.${seasonId}&order=round_number.asc`,
  );
  if (!res.ok) {
    console.error('Rounds lookup failed:', res.data);
    process.exit(1);
  }
  const now = Date.now();
  for (const r of res.data ?? []) {
    const sub = new Date(r.submission_deadline_at).getTime();
    const vote = new Date(r.voting_deadline_at).getTime();
    let phase;
    if (now >= vote) phase = 'results';
    else if (now >= sub) phase = 'voting';
    else phase = 'submissions';
    console.log(`R${String(r.round_number).padStart(2, '0')} [${phase.padEnd(11)}] ${r.id}  "${r.prompt}"`);
    console.log(`    subs close: ${r.submission_deadline_at}`);
    console.log(`    vote close: ${r.voting_deadline_at}`);
  }
}

const commands = {
  'seed-league':          seedLeague,
  'setup-players':        setupPlayers,
  'sync-state':           syncState,
  'create-user':          createUser,
  'register-player':      registerPlayer,
  'add-member':           addKnownMember,
  join:                   joinForPlayer,
  advance:                advanceRound,
  submit:                 submitForPlayer,
  vote:                   voteForPlayer,
  'all-submit':           allSubmit,
  'all-vote':             allVote,
  'close-voting':         closeVoting,
  'round-results':        roundResults,
  'active-round':         activeRound,
  rounds:                 listRounds,
  'invite-link':          inviteLink,
};

const fn = commands[command];
if (!fn) {
  console.log('Usage: node scripts/test.mjs <command> [options]');
  console.log('');
  console.log('  seed-league    --commissioner <victor|andrea|uuid> [--name <league-name>] [--rounds <n>]');
  console.log('  setup-players  --league <id> | --season <id>');
  console.log('  sync-state     (write fixture + known user IDs into state — run after state is lost)');
  console.log('  create-user    --player <D|E>');
  console.log('  add-member     --name <victor|andrea> --league <id>');
  console.log('  join           --player <A-E> --invite <url-or-token>');
  console.log('  advance        --round <id> [--subs-close <s>] [--vote-close <s>]');
  console.log('  submit         --player <A-E> --round <id>');
  console.log('  vote           --player <A-E> --round <id>');
  console.log('  all-submit     --league <id>   (runs submit for A, B, C against active round)');
  console.log('  all-vote       --league <id>   (runs vote   for A, B, C against active round)');
  console.log('  close-voting   [--round <id>]');
  console.log('  round-results  --round <id>');
  console.log('  active-round   --league <id>');
  console.log('  rounds         --season <id>');
  console.log('  invite-link    --season <id>');
  process.exit(1);
}

fn(env, args).catch((err) => { console.error(err.message ?? err); process.exit(1); });
