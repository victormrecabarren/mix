# mix — Architecture Guide

This document defines the architectural pattern introduced in the
`decompose-services` refactor. Every new feature should extend this pattern,
not work around it.

---

## The core idea

**The DB is the API boundary.** Services are thin, typed wrappers over that
boundary. Query hooks are a React-specific ergonomic layer over services.
Screens compose hooks and mutations — they do not contain business logic,
validation rules, or orchestration logic.

If the UI disappeared tomorrow, every user-facing action must still be
callable as a plain function. That is the contract.

---

## The layers

```
apps/mobile/src/
  services/     <- pure async functions. No React, no hooks.
  queries/      <- thin TanStack Query wrappers over services.
  screens/      <- dumb. Call hooks, render JSX, call mutations.
  lib/          <- platform glue (supabase client, Spotify OAuth helpers).
  context/      <- stateful orchestration (Session, League, Playback).
```

### services/

- Pure async functions. No React, no hooks, no framework.
- Framework-agnostic so any client (prototype screen, alt UI, CLI script)
  can call them directly.
- Talk to Supabase (tables or RPCs) and return typed domain objects.
- Throw typed errors (subclasses of `MixError` in `services/errors.ts`).
  Never surface raw Postgres messages to callers.
- One file per domain: `votes.ts`, `submissions.ts`, `rounds.ts`,
  `seasons.ts`, `leagues.ts`, `results.ts`, `standings.ts`,
  `commissioner.ts`, `invites.ts`, `auth.ts`, `users.ts`,
  `spotifySearch.ts`.

### queries/

- One hook per service function that needs caching or reactive data.
- Keys defined in one place: `queries/keys.ts`. Hierarchical for prefix
  invalidation (e.g. `['round', roundId]` invalidates every round-scoped
  entry).
- Mutation hooks wrap service functions and trigger invalidation via
  `queries/invalidation.ts`. That file is the single source of truth for
  what a mutation invalidates.
- Hooks are thin. If the underlying service changes shape, the hook file
  should rarely need edits.

### screens/

- Compose hooks. Render JSX. Dispatch mutations on user events.
- No inline `supabase.from(...)` or `supabase.rpc(...)` calls.
- No business-logic branching that could live in the service.
- Client-side helpers that work on already-fetched data (e.g. formatting,
  phase derivation from timestamps) are fine inline — or extracted to
  `src/lib/utils/` if reused. These are conceptually distinct from
  services: services are load-bearing and DB-touching; helpers are
  cosmetic and pure.

---

## Rules for adding a new feature

When the work touches data or side-effects, follow this order:

1. **Add or update the DB contract first.** New tables, columns, triggers,
   or RPCs go in `supabase/migrations/` as a timestamped migration.
   Validation rules that must be enforced belong in the DB — never
   client-only.
2. **Add a service function** in the appropriate `services/*.ts` file.
   Accept camelCase args, return typed domain objects, throw typed errors.
   If the DB raises a new error message, extend `MixError` subclasses and
   the `postgresToMixError` mapper.
3. **Add a query key** entry in `queries/keys.ts`. Put it under the right
   prefix so invalidation cascades correctly.
4. **Add a hook** (`use*.ts`) — a thin wrapper over the service.
   For mutations, add an entry to `invalidations` in
   `queries/invalidation.ts` and call it from the hook's `onSuccess`.
5. **Wire the screen** to use the hook. Replace any inline supabase call
   at the same time. Screens should not gain new inline data access.
6. **Type-check** (`pnpm --filter @mix/mobile type-check`) and smoke-test
   the flow before committing.

For strictly cosmetic helpers (formatting, UI state shape), skip steps 1–4
and keep the helper near the consuming UI.

---

## Canonical examples to imitate

Read these before writing new code in the same shape.

- **Service:** `apps/mobile/src/services/votes.ts`
- **Typed errors + mapper:** `apps/mobile/src/services/errors.ts`
- **Query key factory:** `apps/mobile/src/queries/keys.ts`
- **Invalidation map:** `apps/mobile/src/queries/invalidation.ts`
- **Query hook:** `apps/mobile/src/queries/useRound.ts`
- **Mutation hook:** `apps/mobile/src/queries/useSubmitVotes.ts`
- **Screen wired end-to-end:** `apps/mobile/src/screens/round/RoundScreen.tsx`

---

## Anti-patterns to avoid

Do not:

- Call `supabase.from(...)` or `supabase.rpc(...)` from a screen. Add a
  service function instead.
- Use `useState` + `useEffect` to manage server data. Use a query hook.
- Duplicate validation in the client "just in case." The DB is authoritative;
  the client catches typed errors from the service.
- Match on raw Postgres error strings. Add an error class and a mapper entry.
- Invalidate queries from a screen ad-hoc. Add an entry to the invalidation
  map and call it from the mutation hook.
- Introduce a second query key for the same resource. If two callers need the
  same data, they use the same hook and key.
- Reach into `lib/` from a screen for anything data-shaped. `lib/` is
  platform glue consumed by services.

---

## Intentionally out of scope of this pattern

These remain stateful / platform-specific infrastructure and are not
expected to be services:

- `context/SessionContext.tsx` — Spotify native SDK bridge, AppState
  foregrounding, Supabase auth orchestration.
- `context/LeagueContext.tsx` — client state for the active league.
- `playback/*` — Spotify Web Playback SDK, SoundCloud iframe player, and
  their React coordinator. Playback is event-driven and reactive; a
  command-style service API doesn't fit.

If a future need emerges (real-time subscriptions, draft persistence,
multi-platform auth) that crosses these boundaries, extend the pattern
deliberately rather than folding everything into services.

---

## Known tech debt tracked against the pattern

- `packages/db/types.ts` is stale; some services cast through `unknown`.
  Regenerate with `supabase gen types` to clean these up.
- Per-track vote cap is enforced only in UI. Needs a DB constraint or
  check in `submit_votes`.
- `SessionContext` and `LeagueContext` still have inline supabase reads.
  Intentionally left; migrate if these contexts are ever restructured.
