"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserLozzaAdapter } from "@/lib/chess/engine-adapter";
import { isTerminal } from "@/lib/chess/rules";

export type LiveEvaluationStatus = "idle" | "evaluating";

/** Analyzes whichever position is passed in, debounced against rapid navigation (e.g. holding an arrow key). */
export function useLiveEvaluation(fen: string): { cp: number | undefined; status: LiveEvaluationStatus } {
  const engine = useRef<BrowserLozzaAdapter>(undefined);
  const [analysis, setAnalysis] = useState<{ fen: string; cp: number }>();
  const terminal = isTerminal(fen);

  useEffect(() => () => engine.current?.dispose(), []);

  useEffect(() => {
    if (terminal) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const adapter = (engine.current ??= new BrowserLozzaAdapter());
      adapter
        .analyze(fen, { multiPv: 1, moveTimeMs: 500 })
        .then((result) => {
          if (cancelled) return;
          const candidate = result.candidates.find((item) => item.uci === result.bestMove) ?? result.candidates[0];
          if (candidate) setAnalysis({ fen, cp: fen.split(" ")[1] === "w" ? candidate.scoreCp : -candidate.scoreCp });
        })
        .catch((error) => {
          if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        });
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      engine.current?.stop();
    };
  }, [fen, terminal]);

  const cp = !terminal && analysis?.fen === fen ? analysis.cp : undefined;
  const status: LiveEvaluationStatus = !terminal && analysis?.fen !== fen ? "evaluating" : "idle";

  return { cp, status };
}
