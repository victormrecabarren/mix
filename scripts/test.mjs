#!/usr/bin/env node
// ─── mix test flow script ────────────────────────────────────────────────────
//
// Commands:
//   node scripts/test.mjs setup-players --league <id>
//     Create fake players A, B, C in Supabase auth and add them to the league.
//     Run once per league. Saves player IDs to scripts/.test-state.json.
//
//   node scripts/test.mjs advance --round <id> --subs-close <seconds> [--vote-close <seconds>]
//     Set the round's deadlines relative to now.
//     --subs-close  seconds until submissions close  (default: 20)
//     --vote-close  seconds until voting closes      (default: subs-close + 120)
//
//   node scripts/test.mjs submit --player <A|B|C> --round <id>
//     Submit Spotify-recommended tracks for a fake player.
//     A = hip-hop, B = rock, C = pop
//
//   node scripts/test.mjs vote --player <A|B|C> --round <id>
//     Distribute points randomly and leave a comment for a fake player.
//
// Setup: copy scripts/.env.test.example → scripts/.env.test and fill in values.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ENV_PATH  = join(__dir, '.env.test');
const STATE_PATH = join(__dir, '.test-state.json');

// ─── Player config ────────────────────────────────────────────────────────────

const PLAYERS = {
  A: { name: 'Player A', email: 'player-a@test.mix', genre: 'hip-hop' },
  B: { name: 'Player B', email: 'player-b@test.mix', genre: 'rock' },
  C: { name: 'Player C', email: 'player-c@test.mix', genre: 'pop' },
};

const COMMENTS = {
  A: ['hard', 'this slaps', 'bars on bars', 'fire', 'no skip'],
  B: ['riff is insane', 'heavy', 'classic vibes', 'banger', 'guitar gods'],
  C: ['so catchy', 'love the hook', "can't stop listening", 'perfect pop', 'earworm'],
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
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1] ?? true;
      i++;
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
  const res = await fetch(
    `https://api.spotify.com/v1/recommendations?seed_genres=${genre}&limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  return data.tracks ?? [];
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

  for (const [key, player] of Object.entries(PLAYERS)) {
    console.log(`\nSetting up Player ${key} (${player.name})...`);

    // Create auth user
    const createRes = await sb(env, '/auth/v1/admin/users', 'POST', {
      email: player.email,
      password: 'TestPassword123!',
      email_confirm: true,
    });

    let userId;
    if (createRes.ok && createRes.data?.id) {
      userId = createRes.data.id;
      console.log(`  ✓ Auth user created: ${userId}`);
    } else if (state.players[key]) {
      userId = state.players[key];
      console.log(`  Already exists — using saved ID: ${userId}`);
    } else {
      console.error(`  Failed to create auth user and no saved ID found.`);
      console.error(`  Response:`, createRes.data);
      process.exit(1);
    }

    state.players[key] = userId;

    // Upsert into public.users
    await sb(env, '/rest/v1/users', 'POST', { id: userId, display_name: player.name },
      { Prefer: 'resolution=merge-duplicates,return=representation' });

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

  const subsClose = parseInt(args['subs-close'] ?? '20', 10);
  const voteClose = parseInt(args['vote-close'] ?? String(subsClose + 120), 10);

  const subDeadline  = new Date(Date.now() + subsClose * 1000).toISOString();
  const voteDeadline = new Date(Date.now() + voteClose * 1000).toISOString();

  const res = await sb(env, `/rest/v1/rounds?id=eq.${roundId}`, 'PATCH', {
    submission_deadline_at: subDeadline,
    voting_deadline_at: voteDeadline,
  });

  if (res.ok) {
    console.log(`✓ Round updated`);
    console.log(`  Submissions close in ${subsClose}s  →  ${subDeadline}`);
    console.log(`  Voting closes in    ${voteClose}s  →  ${voteDeadline}`);
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

  // Distribute points randomly across submissions
  const pts = distributePoints(totalPoints, subs.length, maxPerTrack);
  const votes = subs.map((s, i) => ({ submission_id: s.id, points: pts[i] }));

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

// ─── Entry ────────────────────────────────────────────────────────────────────

const [,, command, ...rest] = process.argv;
const args = parseArgs(rest);
const env = loadEnv();

const commands = {
  'setup-players': setupPlayers,
  advance:         advanceRound,
  submit:          submitForPlayer,
  vote:            voteForPlayer,
};

const fn = commands[command];
if (!fn) {
  console.log('Usage: node scripts/test.mjs <command> [options]');
  console.log('');
  console.log('  setup-players  --league <id>');
  console.log('  advance        --round <id> [--subs-close <s>] [--vote-close <s>]');
  console.log('  submit         --player <A|B|C> --round <id>');
  console.log('  vote           --player <A|B|C> --round <id>');
  process.exit(1);
}

fn(env, args).catch((err) => { console.error(err.message ?? err); process.exit(1); });
