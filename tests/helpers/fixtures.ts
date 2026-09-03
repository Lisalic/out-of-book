import { Chess } from "chess.js";
import { emptyGraph, ensurePosition } from "@/lib/chess/graph";
import { importPgn } from "@/lib/chess/pgn";
import type { EngineAnalysis } from "@/lib/chess/engine-adapter";
import type { EngineCandidate, Repertoire, TraineeColor } from "@/lib/chess/types";

/** A repertoire built from PGN — pass an empty string for one with only a root position. */
export function repertoireFixture(
  pgn = "1. e4 e5 2. Nf3 *",
  overrides: Partial<Repertoire> = {},
): Repertoire {
  const traineeColor: TraineeColor = overrides.traineeColor ?? "white";
  const graph = pgn ? importPgn(pgn, traineeColor).graph : emptyGraph();
  if (!pgn) graph.roots.push(ensurePosition(graph, new Chess().fen(), 0).id);
  return {
    id: "repertoire-1",
    name: "King's Pawn",
    traineeColor,
    graph,
    createdAt: "2026-08-28T12:00:00.000Z",
    updatedAt: "2026-08-28T12:00:00.000Z",
    revision: 1,
    ...overrides,
  };
}

export function candidate(uci: string, scoreCp: number, depth = 12): EngineCandidate {
  return { uci, scoreCp, depth, pv: [uci] };
}

export function analysis(bestMove: string, candidates: EngineCandidate[] = []): EngineAnalysis {
  return { bestMove, candidates: candidates.length ? candidates : [candidate(bestMove, 20)] };
}
