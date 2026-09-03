import { Chess } from "chess.js";
import { positionKey } from "./position-key";
import { moveToUci } from "./rules";
import type { MoveEdge, PositionGraph, TraineeColor } from "./types";

export function emptyGraph(): PositionGraph {
  return { positions: {}, edges: {}, outgoing: {}, roots: [] };
}

export function edgeId(from: string, uci: string): string {
  return `${from}::${uci}`;
}

export function ensurePosition(graph: PositionGraph, fen: string, ply: number): { id: string; existed: boolean } {
  const key = positionKey(fen);
  const existing = graph.positions[key];
  if (existing) {
    existing.minPly = Math.min(existing.minPly, ply);
    return { id: key, existed: true };
  }
  graph.positions[key] = { id: key, key, fen, minPly: ply };
  graph.outgoing[key] = [];
  return { id: key, existed: false };
}

export function addGraphMove(
  graph: PositionGraph,
  fen: string,
  sanOrUci: string,
  traineeColor: TraineeColor,
  options: { ply?: number; isMainline?: boolean; comments?: string[]; nags?: number[] } = {},
): MoveEdge {
  const chess = new Chess(fen);
  const from = ensurePosition(graph, fen, options.ply ?? 0).id;
  // chess.js rejects an illegal move by throwing its own parse error; normalize both that
  // and a null return into one message, since callers report it to the user verbatim.
  let move;
  try {
    move = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(sanOrUci)
      ? chess.move({ from: sanOrUci.slice(0, 2), to: sanOrUci.slice(2, 4), promotion: sanOrUci[4] })
      : chess.move(sanOrUci);
  } catch {
    move = undefined;
  }
  if (!move) throw new Error(`Illegal move ${sanOrUci}`);
  const uci = moveToUci(move);
  const to = ensurePosition(graph, chess.fen(), (options.ply ?? 0) + 1).id;
  const id = edgeId(from, uci);
  const accepted = (move.color === "w" ? "white" : "black") === traineeColor;
  const existing = graph.edges[id];
  if (existing) {
    existing.isAccepted ||= accepted;
    existing.isMainline ||= options.isMainline ?? false;
    existing.comments = [...new Set([...existing.comments, ...(options.comments ?? [])])];
    existing.nags = [...new Set([...existing.nags, ...(options.nags ?? [])])];
    return existing;
  }
  const edge: MoveEdge = {
    id,
    from,
    to,
    uci,
    san: move.san,
    isAccepted: accepted,
    isMainline: options.isMainline ?? false,
    sortOrder: graph.outgoing[from]?.length ?? 0,
    comments: options.comments ?? [],
    nags: options.nags ?? [],
  };
  graph.edges[id] = edge;
  (graph.outgoing[from] ??= []).push(id);
  return edge;
}

export function activeEdges(graph: PositionGraph, positionId: string): MoveEdge[] {
  return (graph.outgoing[positionId] ?? [])
    .map((id) => graph.edges[id])
    .filter((edge) => edge && !edge.deletedAt)
    .sort((a, b) => Number(b.isMainline) - Number(a.isMainline) || a.sortOrder - b.sortOrder);
}

export function softDeleteEdge(graph: PositionGraph, id: string): PositionGraph {
  const copy = structuredClone(graph);
  if (copy.edges[id]) copy.edges[id].deletedAt = new Date().toISOString();
  return copy;
}

/** Marks one edge as the mainline continuation from its position, demoting any current sibling mainline. */
export function setMainlineEdge(graph: PositionGraph, id: string): PositionGraph {
  const copy = structuredClone(graph);
  const target = copy.edges[id];
  if (!target) return copy;
  (copy.outgoing[target.from] ?? []).forEach((siblingId) => {
    const sibling = copy.edges[siblingId];
    if (sibling) sibling.isMainline = sibling.id === id;
  });
  return copy;
}

/** Edge ids that exist (by id) in `incoming` and are soft-deleted in `base` — i.e. moves this import could silently resurrect. */
export function restorableDeletedEdgeIds(base: PositionGraph, incoming: PositionGraph): string[] {
  return Object.keys(incoming.edges).filter((id) => base.edges[id]?.deletedAt);
}

/**
 * Merges `incoming` into `base`. A move the user deliberately deleted stays
 * deleted unless its id is present in `restoreDeletedIds` — merging never
 * silently resurrects a soft-deleted move.
 */
export function mergeGraphs(
  base: PositionGraph,
  incoming: PositionGraph,
  restoreDeletedIds: ReadonlySet<string> = new Set(),
): PositionGraph {
  const merged = structuredClone(base);
  Object.values(incoming.positions).forEach((position) => {
    const existing = merged.positions[position.id];
    if (existing) existing.minPly = Math.min(existing.minPly, position.minPly);
    else merged.positions[position.id] = structuredClone(position);
    merged.outgoing[position.id] ??= [];
  });
  Object.values(incoming.edges).forEach((edge) => {
    const existing = merged.edges[edge.id];
    if (existing) {
      existing.isAccepted ||= edge.isAccepted;
      existing.isMainline ||= edge.isMainline;
      existing.comments = [...new Set([...existing.comments, ...edge.comments])];
      existing.nags = [...new Set([...existing.nags, ...edge.nags])];
      if (existing.deletedAt && restoreDeletedIds.has(existing.id)) existing.deletedAt = undefined;
      return;
    }
    merged.edges[edge.id] = structuredClone(edge);
    (merged.outgoing[edge.from] ??= []).push(edge.id);
  });
  merged.roots = [...new Set([...merged.roots, ...incoming.roots])];
  return merged;
}
