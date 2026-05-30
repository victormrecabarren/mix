// Local-authoritative draft ballot store with backend sync.
//
// The desync trap: if the editable ballot lives in the TanStack Query cache,
// any refetch (window focus, the round-prefix invalidation after submit, etc.)
// can overwrite the user's in-flight edits with a *stale* server draft — the
// ballot visibly "falls behind." So drafts are NOT a query. Instead:
//
//   1. Hydrate from the server ONCE per (round, user) on first use.
//   2. Local state is the single source of truth for every read + write
//      thereafter — edits are instant/optimistic and never clobbered.
//   3. We only ever PUSH to the server (debounced ~1.5s, plus a flush when the
//      app backgrounds so a kill doesn't lose the last edit).
//
// Both the voting screen and the Now Playing modal read the SAME provider
// entry, so they stay in lockstep within a session, and progress survives an
// app kill because it's persisted server-side (see migration
// 20260530000000_vote_drafts.sql).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import {
  getVoteDraft,
  saveVoteDraft,
  type VoteDraft,
} from "@/services/voteDrafts";

type Updater<T> = (prev: T) => T;

type DraftEntry = VoteDraft & {
  // Server draft loaded (or confirmed absent) at least once. Until true, the
  // UI should treat the ballot as still loading rather than empty.
  hydrated: boolean;
  // A push is in flight (surfaced as a subtle "Saving…/Saved" hint).
  saving: boolean;
  // Local has edits not yet confirmed persisted.
  dirty: boolean;
};

const FRESH: DraftEntry = {
  allocation: {},
  comments: {},
  hydrated: false,
  saving: false,
  dirty: false,
};

interface VotingDraftContextValue {
  entries: Record<string, DraftEntry>;
  ensureHydrated: (roundId: string, userId: string) => void;
  setAllocation: (
    roundId: string,
    userId: string,
    updater: Updater<Record<string, number>>,
  ) => void;
  setComments: (
    roundId: string,
    userId: string,
    updater: Updater<Record<string, string>>,
  ) => void;
  cancelSave: (roundId: string, userId: string) => void;
}

const Ctx = createContext<VotingDraftContextValue | null>(null);

const SAVE_DELAY_MS = 1500;
const keyOf = (roundId: string, userId: string) => `${roundId}::${userId}`;

export function VotingDraftProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, DraftEntry>>({});

  // Mirror of `entries` for reading the latest snapshot inside async callbacks
  // (debounced saves) without stale closures.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Monotonic edit counter per key — lets a completed save know whether newer
  // edits arrived while it was in flight (so it doesn't wrongly mark clean).
  const versions = useRef<Map<string, number>>(new Map());
  const hydrating = useRef<Set<string>>(new Set());

  const doSave = useCallback((roundId: string, userId: string) => {
    const key = keyOf(roundId, userId);
    const entry = entriesRef.current[key];
    if (!entry) return;
    const versionAtSave = versions.current.get(key) ?? 0;
    setEntries((prev) =>
      prev[key] ? { ...prev, [key]: { ...prev[key], saving: true } } : prev,
    );
    saveVoteDraft(roundId, userId, {
      allocation: entry.allocation,
      comments: entry.comments,
    })
      .then(() => {
        setEntries((prev) => {
          const cur = prev[key];
          if (!cur) return prev;
          // Only mark clean if nothing changed since this save started.
          const stillCurrent =
            (versions.current.get(key) ?? 0) === versionAtSave;
          return {
            ...prev,
            [key]: { ...cur, saving: false, dirty: stillCurrent ? false : cur.dirty },
          };
        });
      })
      .catch(() => {
        // Keep dirty=true so the next edit (or background flush) retries.
        setEntries((prev) =>
          prev[key] ? { ...prev, [key]: { ...prev[key], saving: false } } : prev,
        );
      });
  }, []);

  const scheduleSave = useCallback(
    (roundId: string, userId: string) => {
      const key = keyOf(roundId, userId);
      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing);
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          doSave(roundId, userId);
        }, SAVE_DELAY_MS),
      );
    },
    [doSave],
  );

  const flushAll = useCallback(() => {
    for (const [key, t] of timers.current.entries()) {
      clearTimeout(t);
      timers.current.delete(key);
      const sep = key.indexOf("::");
      doSave(key.slice(0, sep), key.slice(sep + 2));
    }
  }, [doSave]);

  // Persist pending edits when the app backgrounds — covers "kill the app"
  // better than the debounce window alone.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background" || s === "inactive") flushAll();
    });
    return () => sub.remove();
  }, [flushAll]);

  const ensureHydrated = useCallback((roundId: string, userId: string) => {
    const key = keyOf(roundId, userId);
    if (hydrating.current.has(key)) return;
    if (entriesRef.current[key]?.hydrated) return;
    hydrating.current.add(key);
    getVoteDraft(roundId, userId)
      .then((server) => {
        setEntries((prev) => {
          const cur = prev[key];
          if (cur?.hydrated) return prev;
          // If the user already edited before the server responded, their
          // local edits are the newer truth — keep them, just mark hydrated.
          if (cur?.dirty) return { ...prev, [key]: { ...cur, hydrated: true } };
          return {
            ...prev,
            [key]: {
              allocation: server.allocation,
              comments: server.comments,
              hydrated: true,
              saving: false,
              dirty: false,
            },
          };
        });
      })
      .catch(() => {
        // Fail open: mark hydrated so editing isn't blocked forever. The next
        // edit will push and reconcile.
        setEntries((prev) =>
          prev[key]?.hydrated
            ? prev
            : { ...prev, [key]: { ...(prev[key] ?? FRESH), hydrated: true } },
        );
      })
      .finally(() => hydrating.current.delete(key));
  }, []);

  const setAllocation = useCallback(
    (
      roundId: string,
      userId: string,
      updater: Updater<Record<string, number>>,
    ) => {
      const key = keyOf(roundId, userId);
      versions.current.set(key, (versions.current.get(key) ?? 0) + 1);
      setEntries((prev) => {
        const cur = prev[key] ?? FRESH;
        return {
          ...prev,
          [key]: { ...cur, allocation: updater(cur.allocation), dirty: true },
        };
      });
      scheduleSave(roundId, userId);
    },
    [scheduleSave],
  );

  const setComments = useCallback(
    (
      roundId: string,
      userId: string,
      updater: Updater<Record<string, string>>,
    ) => {
      const key = keyOf(roundId, userId);
      versions.current.set(key, (versions.current.get(key) ?? 0) + 1);
      setEntries((prev) => {
        const cur = prev[key] ?? FRESH;
        return {
          ...prev,
          [key]: { ...cur, comments: updater(cur.comments), dirty: true },
        };
      });
      scheduleSave(roundId, userId);
    },
    [scheduleSave],
  );

  // Called on submit: kill any pending debounced save so a stray write can't
  // re-create the server row that submitVotes just deleted. Deliberately does
  // NOT reset local state — the just-submitted allocation stays visible
  // (read-only) until myVotes refetches and takes over, avoiding a 0-pts
  // flicker. Once the user has voted the draft is ignored for editing anyway.
  const cancelSave = useCallback((roundId: string, userId: string) => {
    const key = keyOf(roundId, userId);
    const t = timers.current.get(key);
    if (t) {
      clearTimeout(t);
      timers.current.delete(key);
    }
    // Bump version so any in-flight save won't later mark the entry clean.
    versions.current.set(key, (versions.current.get(key) ?? 0) + 1);
  }, []);

  const value = useMemo(
    () => ({ entries, ensureHydrated, setAllocation, setComments, cancelSave }),
    [entries, ensureHydrated, setAllocation, setComments, cancelSave],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Bound view of one (round, user) draft. Kicks off hydration on mount and
// returns the local-authoritative allocation/comments plus sync status.
export function useVotingDraftStore(
  roundId: string | undefined,
  userId: string | undefined,
) {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useVotingDraftStore must be used within VotingDraftProvider");
  }
  const ready = !!roundId && !!userId;

  useEffect(() => {
    if (ready) ctx.ensureHydrated(roundId!, userId!);
  }, [ready, roundId, userId, ctx]);

  const key = ready ? keyOf(roundId!, userId!) : "";
  const entry = (ready && ctx.entries[key]) || FRESH;

  const setAllocation = useCallback(
    (updater: Updater<Record<string, number>>) => {
      if (ready) ctx.setAllocation(roundId!, userId!, updater);
    },
    [ctx, ready, roundId, userId],
  );
  const setComments = useCallback(
    (updater: Updater<Record<string, string>>) => {
      if (ready) ctx.setComments(roundId!, userId!, updater);
    },
    [ctx, ready, roundId, userId],
  );
  const cancelSave = useCallback(() => {
    if (ready) ctx.cancelSave(roundId!, userId!);
  }, [ctx, ready, roundId, userId]);

  return {
    allocation: entry.allocation,
    comments: entry.comments,
    hydrated: entry.hydrated,
    saving: entry.saving,
    dirty: entry.dirty,
    setAllocation,
    setComments,
    cancelSave,
  };
}
