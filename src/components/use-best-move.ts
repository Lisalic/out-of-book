"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { BrowserLozzaAdapter } from "@/lib/chess/engine-adapter";
import { isTerminal, legalMoves } from "@/lib/chess/rules";
import { unlockBoardSound } from "./board-sound";

export function useBestMove({ fen, contextKey, enabled = true, onMove }: {
  fen: string;
  /** Includes navigation and session identity, even when the FEN is unchanged. */
  contextKey: string;
  enabled?: boolean;
  onMove: (uci: string) => void;
}) {
  const eligible = enabled && !isTerminal(fen);
  const context = useMemo(() => ({ fen, contextKey, eligible }), [fen, contextKey, eligible]);
  const pending = useRef<{ engine: BrowserLozzaAdapter } | undefined>(undefined);
  const [state, setState] = useState<{ context: typeof context; status: "thinking" | "error" | "idle" }>();

  // Cancel during commit, before an old result can act on a newly displayed board.
  useLayoutEffect(() => () => {
    const request = pending.current;
    pending.current = undefined;
    request?.engine.dispose();
  }, [context]);

  async function play() {
    if (!eligible || pending.current) return;
    unlockBoardSound();
    const request = { engine: new BrowserLozzaAdapter() };
    pending.current = request;
    setState({ context, status: "thinking" });
    try {
      const result = await request.engine.analyze(fen, { multiPv: 1, moveTimeMs: 500 });
      if (pending.current !== request) return;
      if (!legalMoves(fen).some((move) => move.uci === result.bestMove)) {
        throw new Error("Engine returned an illegal move");
      }
      onMove(result.bestMove);
      setState({ context, status: "idle" });
    } catch {
      if (pending.current === request) setState({ context, status: "error" });
    } finally {
      if (pending.current === request) pending.current = undefined;
      request.engine.dispose();
    }
  }

  const thinking = state?.context === context && state.status === "thinking";
  return {
    play,
    thinking,
    disabled: !eligible || thinking,
    error: state?.context === context && state.status === "error"
      ? "Could not find the best move. Please try again."
      : undefined,
  };
}
