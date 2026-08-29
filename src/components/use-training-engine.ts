"use client";

import { useEffect, useRef } from "react";
import { activeEdges } from "@/lib/chess/graph";
import { seededRandom, selectDeviation } from "@/lib/chess/deviation";
import { BrowserLozzaAdapter } from "@/lib/chess/engine-adapter";
import { moveTimeForStrength, weightedCandidate } from "@/lib/chess/engine-strength";
import { legalMoves } from "@/lib/chess/rules";
import {
  applyEngineMove,
  applyOpponentBookMove,
  beginEngineTakeover,
  setLineEvaluation,
} from "@/lib/chess/training-machine";
import type { MoveEdge, Repertoire, TrainingSession } from "@/lib/chess/types";

export type EngineStatus = "idle" | "thinking" | "evaluating";

function sessionKey(session: TrainingSession): string {
  return [session.id, session.phase, session.fen, session.moves.length, session.drill?.currentLineIndex ?? 0].join(":");
}

function chooseBookMove(edges: MoveEdge[], plannedUci: string | undefined, seed: number): MoveEdge {
  const planned = edges.find((edge) => edge.uci === plannedUci);
  if (planned) return planned;
  const random = seededRandom(seed);
  const weights = edges.map((edge) => (edge.isMainline ? 1.4 : 1));
  let cursor = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < edges.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return edges[index];
  }
  return edges[0];
}

function fallbackMove(fen: string, excluded: string[] = []): string | undefined {
  const blocked = new Set(excluded);
  return legalMoves(fen)
    .filter((move) => !blocked.has(move.uci))
    .sort((a, b) => Number(/[+#]/.test(b.san)) - Number(/[+#]/.test(a.san)) || Number(b.san.includes("x")) - Number(a.san.includes("x")))[0]?.uci;
}

export function useTrainingEngine(
  active: boolean,
  session: TrainingSession | undefined,
  repertoire: Repertoire | undefined,
  setSession: React.Dispatch<React.SetStateAction<TrainingSession | undefined>>,
) {
  const engine = useRef<BrowserLozzaAdapter | undefined>(undefined);
  const status: EngineStatus = session?.phase === "opponent_book_turn" || session?.phase === "opponent_engine_turn"
    ? "thinking"
    : session?.phase === "complete" && session.lineCompletionReason !== "checkmate" && session.lineEvaluationCp === undefined
      ? "evaluating"
      : "idle";

  useEffect(() => () => engine.current?.dispose(), []);

  useEffect(() => {
    if (!active || !session || !repertoire) return;
    if (session.phase !== "opponent_book_turn" && session.phase !== "opponent_engine_turn") return;
    const snapshot = session;
    const key = sessionKey(snapshot);
    let cancelled = false;

    const commit = (next: TrainingSession) => {
      if (cancelled) return;
      setSession((current) => current && sessionKey(current) === key ? next : current);
    };

    const play = async () => {
      const edges = activeEdges(repertoire.graph, snapshot.positionKey);
      const deviationDue = snapshot.phase === "opponent_book_turn"
        && snapshot.plannedDeviationPly !== null
        && snapshot.moves.length >= snapshot.plannedDeviationPly
        && snapshot.takeoverReason === null;

      if (snapshot.phase === "opponent_book_turn" && !deviationDue && edges.length) {
        await new Promise((resolve) => window.setTimeout(resolve, 220));
        const plannedUci = snapshot.drill?.lines[snapshot.drill.currentLineIndex]?.edgeUcis[snapshot.moves.length];
        commit(applyOpponentBookMove(snapshot, repertoire.graph, chooseBookMove(edges, plannedUci, snapshot.moves.length + 17)));
        return;
      }

      const adapter = (engine.current ??= new BrowserLozzaAdapter());
      try {
        const analysis = await adapter.analyze(snapshot.fen, {
          multiPv: deviationDue ? 6 : 4,
          // Lozza is pure JS, not WASM — it needs more wall-clock time than Stockfish did to
          // reach the depth where MultiPV actually populates more than one candidate.
          moveTimeMs: moveTimeForStrength(snapshot.strength, deviationDue ? 700 : 500),
        });
        if (deviationDue) {
          const selected = selectDeviation(
            analysis.candidates,
            edges.map((edge) => edge.uci),
            legalMoves(snapshot.fen).map((move) => move.uci),
            snapshot.strength,
            seededRandom(Date.now() + snapshot.moves.length + (snapshot.drill?.currentLineIndex ?? 0) * 997),
          );
          if (selected) {
            commit(applyEngineMove(beginEngineTakeover(snapshot), selected.uci));
            return;
          }
          if (edges.length) {
            commit(applyOpponentBookMove(snapshot, repertoire.graph, chooseBookMove(edges, undefined, snapshot.moves.length + 29)));
            return;
          }
        }
        // Lozza has no engine-side strength limiter — play at the requested approximate
        // strength by weighting which MultiPV candidate is chosen, not always the top one.
        const played = weightedCandidate(
          analysis.candidates,
          snapshot.strength,
          seededRandom(Date.now() + snapshot.moves.length + (snapshot.drill?.currentLineIndex ?? 0) * 991),
        );
        commit(applyEngineMove(snapshot, played?.uci ?? analysis.bestMove));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const excluded = deviationDue ? edges.map((edge) => edge.uci) : [];
        const move = fallbackMove(snapshot.fen, excluded) ?? fallbackMove(snapshot.fen);
        if (!move) return;
        const takeover = snapshot.phase === "opponent_engine_turn" ? snapshot : beginEngineTakeover(snapshot);
        commit(applyEngineMove(takeover, move));
      }
    };

    void play();
    return () => {
      cancelled = true;
      engine.current?.stop();
    };
  }, [active, session, repertoire, setSession]);

  useEffect(() => {
    if (!active || !session || session.phase !== "complete") return;
    if (session.lineCompletionReason === "checkmate" || session.lineEvaluationCp !== undefined) return;
    const snapshot = session;
    const key = sessionKey(snapshot);
    let cancelled = false;

    const analyze = async () => {
      try {
        const adapter = (engine.current ??= new BrowserLozzaAdapter());
        // Full-strength, deeper analysis for the final-position score — this must not use
        // the same weighted/limited play the trainee's opponent used during the game.
        const result = await adapter.analyze(snapshot.fen, { multiPv: 1, moveTimeMs: 900 });
        const candidate = result.candidates.find((item) => item.uci === result.bestMove) ?? result.candidates[0];
        const evaluation = candidate
          ? (snapshot.fen.split(" ")[1] === "w" ? candidate.scoreCp : -candidate.scoreCp)
          : null;
        if (!cancelled) {
          setSession((current) => current && sessionKey(current) === key ? setLineEvaluation(current, evaluation) : current);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setSession((current) => current && sessionKey(current) === key ? setLineEvaluation(current, null) : current);
        }
      }
    };

    void analyze();
    return () => {
      cancelled = true;
      engine.current?.stop();
    };
  }, [active, session, setSession]);

  return {
    status,
    stop: () => engine.current?.stop(),
  };
}
