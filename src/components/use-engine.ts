"use client";

import { useEffect, useState } from "react";
import { BrowserLozzaAdapter, type EngineAdapter } from "@/lib/chess/engine-adapter";

export type EngineFactory = () => EngineAdapter;

export const defaultEngineFactory: EngineFactory = () => new BrowserLozzaAdapter();

export interface EngineHandle {
  /** The adapter, constructed on first use — starting a Worker before a position needs analyzing is pure cost. */
  get(): EngineAdapter;
  stop(): void;
}

interface OwnedEngine extends EngineHandle {
  dispose(): void;
}

/**
 * One lazily created engine per screen, disposed on unmount. The factory is a parameter so
 * tests can drive these hooks with a stub adapter instead of a real Worker; it is captured
 * once, since an engine outlives the renders of the screen that owns it. The returned
 * handle keeps a stable identity, so effects can depend on it without restarting a search.
 */
export function useEngine(createEngine: EngineFactory = defaultEngineFactory): EngineHandle {
  const [handle] = useState<OwnedEngine>(() => {
    let engine: EngineAdapter | undefined;
    return {
      get: () => (engine ??= createEngine()),
      stop: () => engine?.stop(),
      dispose: () => {
        engine?.dispose();
        engine = undefined;
      },
    };
  });

  useEffect(() => () => handle.dispose(), [handle]);
  return handle;
}
