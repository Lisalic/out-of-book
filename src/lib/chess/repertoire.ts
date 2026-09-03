import { emptyGraph, ensurePosition } from "./graph";
import { createId } from "./id";
import { fenTurn } from "./position-key";
import { START_FEN } from "./rules";
import type { PositionGraph, Repertoire, TraineeColor } from "./types";

export const DEFAULT_REPERTOIRE_NAME = "Untitled repertoire";

export function createRepertoire(
  options: { name?: string; traineeColor?: TraineeColor; rootFen?: string; now?: number } = {},
): Repertoire {
  const timestamp = new Date(options.now ?? Date.now()).toISOString();
  const graph = emptyGraph();
  graph.roots.push(ensurePosition(graph, options.rootFen ?? START_FEN, 0).id);
  return {
    id: createId("repertoire"),
    name: options.name ?? DEFAULT_REPERTOIRE_NAME,
    traineeColor: options.traineeColor ?? "white",
    graph,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  };
}

/**
 * Every edit goes through here: a saved repertoire is only ever replaced wholesale, and
 * each replacement must bump the revision and touch `updatedAt` (the library sorts on it).
 * Doing that at each call site is what makes a missed bump possible.
 */
export function reviseRepertoire(
  repertoire: Repertoire,
  changes: Partial<Pick<Repertoire, "name" | "traineeColor" | "graph">>,
  now = Date.now(),
): Repertoire {
  return {
    ...repertoire,
    ...changes,
    revision: repertoire.revision + 1,
    updatedAt: new Date(now).toISOString(),
  };
}

/**
 * Re-sides a repertoire: "accepted" means "a move the trainee chooses", so switching the
 * book's side re-labels every edge by whose turn it was in the position it leaves, rather
 * than by which colour originally owned it.
 */
export function withTraineeColor(graph: PositionGraph, traineeColor: TraineeColor): PositionGraph {
  const next = structuredClone(graph);
  Object.values(next.edges).forEach((edge) => {
    const from = next.positions[edge.from];
    edge.isAccepted = from !== undefined && fenTurn(from.fen) === traineeColor;
  });
  return next;
}
