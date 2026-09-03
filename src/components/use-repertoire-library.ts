"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRepertoire, reviseRepertoire } from "@/lib/chess/repertoire";
import {
  deleteRepertoire,
  getLatestActiveSession,
  listAllReviewStates,
  listRepertoires,
  saveRepertoire,
  saveReviewStates,
} from "@/lib/storage/guest-store";
import type { Repertoire, ReviewState, TrainingSession } from "@/lib/chess/types";

const LOAD_FAILED = "Local data could not be loaded. Refresh the page to try again.";
const SAVE_FAILED = "Your latest repertoire change could not be saved locally.";
const DELETE_FAILED = "That repertoire could not be deleted.";

function byNewest(a: Repertoire, b: Repertoire): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

export interface RepertoireLibrary {
  repertoires: Repertoire[];
  reviewStates: ReviewState[];
  loading: boolean;
  error?: string;
  reportError: (message: string) => void;
  dismissError: () => void;
  /** Creates, saves, and returns a new empty repertoire. */
  create: () => Promise<Repertoire>;
  /** Saves and returns an already-built repertoire — e.g. one seeded from an opening preset. */
  add: (repertoire: Repertoire) => Promise<Repertoire>;
  /** Applies an edit — revision bump, `updatedAt`, optimistic list update, then the write. */
  revise: (repertoire: Repertoire, changes: Parameters<typeof reviseRepertoire>[1]) => Promise<Repertoire>;
  remove: (id: string) => Promise<boolean>;
  /** Replaces the given review states in memory and persists them in one transaction. */
  recordReviewStates: (states: ReviewState[]) => void;
}

/**
 * Owns everything read from and written to the local store: the repertoire list, the
 * spaced-repetition states, and the paused drill handed back through `onResumeSession`.
 * Writes are optimistic — the screen updates first and a failed write surfaces as a
 * dismissible banner, because losing an edit to a storage error is worse than showing it.
 */
export function useRepertoireLibrary(
  onResumeSession: (session: TrainingSession) => void,
): RepertoireLibrary {
  const [repertoires, setRepertoires] = useState<Repertoire[]>([]);
  const [reviewStates, setReviewStates] = useState<ReviewState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  // Kept in a ref so a caller passing a fresh closure each render cannot re-trigger the load.
  const resume = useRef(onResumeSession);
  useEffect(() => {
    resume.current = onResumeSession;
  }, [onResumeSession]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listRepertoires(), getLatestActiveSession(), listAllReviewStates()])
      .then(([saved, active, states]) => {
        if (cancelled) return;
        setRepertoires([...saved].sort(byNewest));
        setReviewStates(states);
        if (active && saved.some((item) => item.id === active.repertoireId)) resume.current(active);
      })
      .catch(() => {
        if (!cancelled) setError(LOAD_FAILED);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: Repertoire) => {
    setRepertoires((items) => [next, ...items.filter((item) => item.id !== next.id)].sort(byNewest));
    try {
      await saveRepertoire(next);
      setError(undefined);
    } catch {
      setError(SAVE_FAILED);
    }
    return next;
  }, []);

  const create = useCallback(async () => persist(createRepertoire()), [persist]);
  const add = useCallback(async (repertoire: Repertoire) => persist(repertoire), [persist]);

  const revise = useCallback(
    async (repertoire: Repertoire, changes: Parameters<typeof reviseRepertoire>[1]) =>
      persist(reviseRepertoire(repertoire, changes)),
    [persist],
  );

  const remove = useCallback(async (id: string) => {
    try {
      await deleteRepertoire(id);
      setRepertoires((items) => items.filter((item) => item.id !== id));
      setReviewStates((states) => states.filter((state) => state.repertoireId !== id));
      return true;
    } catch {
      setError(DELETE_FAILED);
      return false;
    }
  }, []);

  const recordReviewStates = useCallback((states: ReviewState[]) => {
    if (!states.length) return;
    const updated = new Set(states.map((state) => state.id));
    setReviewStates((current) => [...current.filter((state) => !updated.has(state.id)), ...states]);
    void saveReviewStates(states).catch(() => setError("Your review progress could not be saved locally."));
  }, []);

  return {
    repertoires,
    reviewStates,
    loading,
    error,
    reportError: setError,
    dismissError: useCallback(() => setError(undefined), []),
    create,
    add,
    revise,
    remove,
    recordReviewStates,
  };
}
