"use client";

import { useEffect } from "react";
import { activeEdges } from "@/lib/chess/graph";
import { seededRandom, selectDeviation } from "@/lib/chess/deviation";
import { isAbortError } from "@/lib/chess/engine-adapter";
import { moveTimeForStrength, weightedCandidate } from "@/lib/chess/engine-strength";
import { whitePerspectiveCp } from "@/lib/chess/evaluation";
import { legalMoves } from "@/lib/chess/rules";
import {
  applyEngineMove,
  applyOpponentBookMove,
  beginEngineTakeover,
  setLineEvaluation,
} from "@/lib/chess/training-machine";
import { useEngine, type EngineFactory } from "./use-engine";
import type { MoveEdge, Repertoire, TrainingSession } from "@/lib/chess/types";

export type EngineStatus = "idle" | "thinking" | "evaluating";

/** How long the opponent "thinks" before replaying a book move — the move is already known. */
const BOOK_MOVE_DELAY_MS = 220;
const FINAL_EVALUATION_MS = 900;

function sessionKey(session: TrainingSession): string {
  return [session.id, session.phase, session.fen, session.moves.length, session.drill?.currentLineIndex ?? 0].join(":");
}

function isOpponentTurn(session: TrainingSession): boolean {
  return session.phase === "opponent_book_turn" || session.phase === "opponent_engine_turn";
}

/** True while a finished line is still waiting on the engine's verdict on the final position. */
function awaitsFinalEvaluation(session: TrainingSession): boolean {
  return session.phase === "complete"
    && session.lineCompletionReason !== "checkmate"
    && session.lineEvaluationCp === undefined;
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

/** Last resort when the engine is unavailable mid-game: a legal move, preferring forcing ones. */
function fallbackMove(fen: string, excluded: string[] = []): string | undefined {
  const blocked = new Set(excluded);
  return legalMoves(fen)
    .filter((move) => !blocked.has(move.uci))
    .sort((a, b) => Number(/[+#]/.test(b.san)) - Number(/[+#]/.test(a.san)) || Number(b.san.includes("x")) - Number(a.san.includes("x")))[0]?.uci;
}

/** A per-line, per-ply seed: deterministic within one position, different across positions. */
function moveSeed(session: TrainingSession, salt: number): number {
  return Date.now() + session.moves.length + (session.drill?.currentLineIndex ?? 0) * salt;
}

export function useTrainingEngine(
  active: boolean,
  session: TrainingSession | undefined,
  repertoire: Repertoire | undefined,
  setSession: React.Dispatch<React.SetStateAction<TrainingSession | undefined>>,
  createEngine?: EngineFactory,
) {
  const engine = useEngine(createEngine);
  const status: EngineStatus = session && isOpponentTurn(session)
    ? "thinking"
    : session && awaitsFinalEvaluation(session)
      ? "evaluating"
      : "idle";

  useEffect(() => {
    if (!active || !session || !repertoire || !isOpponentTurn(session)) return;
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
        await new Promise((resolve) => window.setTimeout(resolve, BOOK_MOVE_DELAY_MS));
        const plannedUci = snapshot.drill?.lines[snapshot.drill.currentLineIndex]?.edgeUcis[snapshot.moves.length];
        commit(applyOpponentBookMove(snapshot, repertoire.graph, chooseBookMove(edges, plannedUci, snapshot.moves.length + 17)));
        return;
      }

      try {
        const analysis = await engine.get().analyze(snapshot.fen, {
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
            seededRandom(moveSeed(snapshot, 997)),
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
        const played = weightedCandidate(analysis.candidates, snapshot.strength, seededRandom(moveSeed(snapshot, 991)));
        commit(applyEngineMove(snapshot, played?.uci ?? analysis.bestMove));
      } catch (error) {
        if (isAbortError(error)) return;
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
      engine.stop();
    };
  }, [active, session, repertoire, setSession, engine]);

  useEffect(() => {
    if (!active || !session || !awaitsFinalEvaluation(session)) return;
    const snapshot = session;
    const key = sessionKey(snapshot);
    let cancelled = false;

    const record = (evaluation: number | null) => {
      if (cancelled) return;
      setSession((current) => current && sessionKey(current) === key ? setLineEvaluation(current, evaluation) : current);
    };

    const analyze = async () => {
      try {
        // Full-strength, deeper analysis for the final-position score — this must not use
        // the same weighted/limited play the trainee's opponent used during the game.
        const result = await engine.get().analyze(snapshot.fen, { multiPv: 1, moveTimeMs: FINAL_EVALUATION_MS });
        record(whitePerspectiveCp(result, snapshot.fen));
      } catch (error) {
        if (isAbortError(error)) return;
        record(null);
      }
    };

    void analyze();
    return () => {
      cancelled = true;
      engine.stop();
    };
  }, [active, session, setSession, engine]);

  return {
    status,
    stop: () => engine.stop(),
  };
}
