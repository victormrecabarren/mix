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
//     Fetch genre-matched Spotify recommendations and submit tracks.
//     A=hip-hop  B=rock  C=pop  D=electronic  E=jazz
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
};

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
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET']) {
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

// ─── Spotify ──────────────────────────────────────────────────────────────────

async function spotifyToken(env) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${env.SPOTIFY_CLIENT_ID}&client_secret=${env.SPOTIFY_CLIENT_SECRET}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Spotify auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function recommendedTracks(token, genre, limit) {
  // /v1/recommendations was deprecated for new apps in 2024 — use search instead
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(genre)}&type=track&limit=10`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Spotify search non-JSON (${res.status}): ${text.slice(0, 200)}`); }
  if (!res.ok) throw new Error(`Spotify search error (${res.status}): ${JSON.stringify(data)}`);
  const tracks = data.tracks?.items ?? [];
  // Shuffle so each fake player gets different tracks
  return tracks.sort(() => Math.random() - 0.5).slice(0, limit);
}

// ─── Point distribution ───────────────────────────────────────────────────────

function distributePoints(total, count, maxPerTrack) {
  const pts = new Array(count).fill(0);
  let remaining = total;
  let guard = 0;
  while (remaining > 0 && guard < 50000) {
    const i = Math.floor(Math.random() * count);
    if (pts[i] < maxPerTrack) { pts[i]++; remaining--; }
    guard++;
  }
  return pts;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function setupPlayers(env, args) {
  const leagueId = args.league;
  if (!leagueId) { console.error('Usage: setup-players --league <id>'); process.exit(1); }

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
  const roundId = args.round;
  if (!key || !roundId) { console.error('Usage: submit --player <A|B|C> --round <id>'); process.exit(1); }
  if (!PLAYERS[key]) { console.error(`Unknown player "${key}". Use A, B, or C.`); process.exit(1); }

  const state = loadState();
  const userId = state.players?.[key];
  if (!userId) { console.error(`No saved ID for Player ${key} — run setup-players first`); process.exit(1); }

  // Get round → season info
  const roundRes = await sb(env, `/rest/v1/rounds?id=eq.${roundId}&select=*,seasons(submissions_per_user)`);
  const round = roundRes.data?.[0];
  if (!round) { console.error('Round not found'); process.exit(1); }
  const limit = round.seasons?.submissions_per_user ?? 1;

  // Fetch recommendations
  const { genre } = PLAYERS[key];
  console.log(`Fetching ${limit} ${genre} recommendation(s) from Spotify...`);
  const token = await spotifyToken(env);
  const tracks = await recommendedTracks(token, genre, limit);
  if (tracks.length === 0) { console.error('No tracks returned from Spotify'); process.exit(1); }

  const rows = tracks.slice(0, limit).map((t) => ({
    round_id: roundId,
    user_id: userId,
    spotify_track_id: t.id,
    track_title: t.name,
    track_artist: t.artists.map((a) => a.name).join(', '),
    track_artwork_url: t.album.images?.[0]?.url ?? null,
    track_isrc: t.external_ids?.isrc ?? '',
    track_album_name: t.album.name,
    track_duration_ms: t.duration_ms,
    track_popularity: t.popularity,
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
  const roundId = args.round;
  if (!key || !roundId) { console.error('Usage: vote --player <A|B|C> --round <id>'); process.exit(1); }
  if (!PLAYERS[key]) { console.error(`Unknown player "${key}". Use A, B, or C.`); process.exit(1); }

  const state = loadState();
  const userId = state.players?.[key];
  if (!userId) { console.error(`No saved ID for Player ${key} — run setup-players first`); process.exit(1); }

  // Get round → season points config
  const roundRes = await sb(env, `/rest/v1/rounds?id=eq.${roundId}&select=*,seasons(default_points_per_round,default_max_points_per_track)`);
  const round = roundRes.data?.[0];
  if (!round) { console.error('Round not found'); process.exit(1); }
  const totalPoints = round.seasons?.default_points_per_round ?? 10;
  const maxPerTrack = round.seasons?.default_max_points_per_track ?? 5;

  // Get submissions to vote on (exclude own)
  const subsRes = await sb(env, `/rest/v1/submissions?round_id=eq.${roundId}&user_id=neq.${userId}&select=id`);
  const subs = subsRes.data ?? [];
  if (subs.length === 0) { console.error('No submissions to vote on for this player'); process.exit(1); }

  // Distribute points randomly across submissions.
  // The votes table has a `points > 0` check, so drop any zero-point rows
  // (distributePoints can leave some submissions at 0 when points < submissions).
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

  // Leave a comment on a random submission
  const commentText = COMMENTS[key][Math.floor(Math.random() * COMMENTS[key].length)];
  const targetSub = subs[Math.floor(Math.random() * subs.length)];
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

const commands = {
  'setup-players':  setupPlayers,
  'create-user':    createUser,
  join:             joinForPlayer,
  advance:          advanceRound,
  submit:           submitForPlayer,
  vote:             voteForPlayer,
  'close-voting':   closeVoting,
  'round-results':  roundResults,
};

const fn = commands[command];
if (!fn) {
  console.log('Usage: node scripts/test.mjs <command> [options]');
  console.log('');
  console.log('  setup-players  --league <id>');
  console.log('  create-user    --player <D|E>');
  console.log('  join           --player <A-E> --invite <url-or-token>');
  console.log('  advance        --round <id> [--subs-close <s>] [--vote-close <s>]');
  console.log('  submit         --player <A-E> --round <id>');
  console.log('  vote           --player <A-E> --round <id>');
  console.log('  close-voting   [--round <id>]');
  console.log('  round-results  --round <id>');
  process.exit(1);
}

fn(env, args).catch((err) => { console.error(err.message ?? err); process.exit(1); });
