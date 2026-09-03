"use client";

import { useEffect, useState } from "react";
import { isAbortError } from "@/lib/chess/engine-adapter";
import { whitePerspectiveCp } from "@/lib/chess/evaluation";
import { isTerminal } from "@/lib/chess/rules";
import { useEngine, type EngineFactory } from "./use-engine";

export type LiveEvaluationStatus = "idle" | "evaluating";

const DEBOUNCE_MS = 150;

/** Analyzes whichever position is passed in, debounced against rapid navigation (e.g. holding an arrow key). */
export function useLiveEvaluation(
  fen: string,
  createEngine?: EngineFactory,
): { cp: number | undefined; status: LiveEvaluationStatus } {
  const engine = useEngine(createEngine);
  const [analysis, setAnalysis] = useState<{ fen: string; cp: number }>();
  const terminal = isTerminal(fen);

  useEffect(() => {
    if (terminal) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      engine
        .get()
        .analyze(fen, { multiPv: 1, moveTimeMs: 500 })
        .then((result) => {
          if (cancelled) return;
          const cp = whitePerspectiveCp(result, fen);
          if (cp !== null) setAnalysis({ fen, cp });
        })
        .catch((error) => {
          if (cancelled || isAbortError(error)) return;
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      engine.stop();
    };
  }, [fen, terminal, engine]);

  const cp = !terminal && analysis?.fen === fen ? analysis.cp : undefined;
  const status: LiveEvaluationStatus = !terminal && analysis?.fen !== fen ? "evaluating" : "idle";

  return { cp, status };
}
