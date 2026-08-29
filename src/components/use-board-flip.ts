"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "out-of-book-board-flipped";
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

/** Board flip is a per-viewer display preference, independent of which side you're training — like every other chess site. */
export function useBoardFlip() {
  const flipped = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, getSnapshot() ? "0" : "1");
    } catch {
      // Ignore — flip just won't persist across visits.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return { flipped, toggle };
}
