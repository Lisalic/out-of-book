import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import {
  activeEdges,
  addGraphMove,
  edgeId,
  emptyGraph,
  ensurePosition,
  mergeGraphs,
  restorableDeletedEdgeIds,
  setMainlineEdge,
  softDeleteEdge,
} from "@/lib/chess/graph";
import { importPgn } from "@/lib/chess/pgn";
import { positionKey } from "@/lib/chess/position-key";
import { START_FEN } from "@/lib/chess/rules";
import type { PositionGraph } from "@/lib/chess/types";

function rootedGraph(): PositionGraph {
  const graph = emptyGraph();
  graph.roots.push(ensurePosition(graph, START_FEN, 0).id);
  return graph;
}

describe("position graph construction", () => {
  it("identifies a position by key, keeping the shallowest ply it was reached at", () => {
    const graph = rootedGraph();
    const first = ensurePosition(graph, START_FEN, 6);
    const second = ensurePosition(graph, START_FEN, 2);
    expect(first.existed).toBe(true);
    expect(second.id).toBe(positionKey(START_FEN));
    expect(graph.positions[second.id].minPly).toBe(0);
  });

  it("accepts a move as SAN or as UCI, including an underpromotion", () => {
    const graph = rootedGraph();
    const san = addGraphMove(graph, START_FEN, "e4", "white");
    const uci = addGraphMove(graph, START_FEN, "d2d4", "white");
    expect(san.uci).toBe("e2e4");
    expect(uci.san).toBe("d4");

    const promotionFen = "8/P7/8/8/8/8/7p/4K2k w - - 0 1";
    const promotion = addGraphMove(rootedGraph(), promotionFen, "a7a8n", "white");
    expect(promotion.san).toBe("a8=N");
  });

  it("rejects an illegal move instead of recording an unreachable edge", () => {
    const graph = rootedGraph();
    expect(() => addGraphMove(graph, START_FEN, "e5", "white")).toThrow(/Illegal move/);
    expect(Object.keys(graph.edges)).toHaveLength(0);
  });

  it("marks a move accepted when it is the trainee's own, and merges annotations on re-add", () => {
    const graph = rootedGraph();
    const white = addGraphMove(graph, START_FEN, "e4", "white", { comments: ["Best by test"], nags: [1] });
    expect(white.isAccepted).toBe(true);

    const again = addGraphMove(graph, START_FEN, "e4", "white", { comments: ["Best by test", "Main"], nags: [3], isMainline: true });
    expect(again.id).toBe(edgeId(positionKey(START_FEN), "e2e4"));
    expect(again.comments).toEqual(["Best by test", "Main"]);
    expect(again.nags).toEqual([1, 3]);
    expect(again.isMainline).toBe(true);
    expect(Object.keys(graph.edges)).toHaveLength(1);
  });

  it("does not accept the opponent's moves for the trainee", () => {
    const graph = rootedGraph();
    const black = addGraphMove(graph, new Chess("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1").fen(), "e5", "white");
    expect(black.isAccepted).toBe(false);
  });
});

describe("activeEdges", () => {
  it("puts the mainline first, then sort order, and hides soft-deleted moves", () => {
    const graph = rootedGraph();
    const root = graph.roots[0];
    addGraphMove(graph, START_FEN, "e4", "white");
    addGraphMove(graph, START_FEN, "d4", "white");
    const c4 = addGraphMove(graph, START_FEN, "c4", "white", { isMainline: true });
    expect(activeEdges(graph, root).map((edge) => edge.san)).toEqual(["c4", "e4", "d4"]);

    const pruned = softDeleteEdge(graph, c4.id);
    expect(activeEdges(pruned, root).map((edge) => edge.san)).toEqual(["e4", "d4"]);
    expect(pruned.edges[c4.id].deletedAt).toBeTruthy();
    // The original graph is untouched — edits are applied to a copy.
    expect(graph.edges[c4.id].deletedAt).toBeUndefined();
  });

  it("returns nothing for a position that has no outgoing moves", () => {
    expect(activeEdges(rootedGraph(), "no-such-position")).toEqual([]);
  });
});

describe("setMainlineEdge", () => {
  it("promotes one move and demotes the sibling that held the mainline", () => {
    const graph = rootedGraph();
    const e4 = addGraphMove(graph, START_FEN, "e4", "white", { isMainline: true });
    const d4 = addGraphMove(graph, START_FEN, "d4", "white");
    const promoted = setMainlineEdge(graph, d4.id);
    expect(promoted.edges[d4.id].isMainline).toBe(true);
    expect(promoted.edges[e4.id].isMainline).toBe(false);
  });

  it("leaves the graph unchanged for an unknown edge", () => {
    const graph = rootedGraph();
    addGraphMove(graph, START_FEN, "e4", "white", { isMainline: true });
    expect(setMainlineEdge(graph, "missing::e2e4")).toEqual(graph);
  });
});

describe("mergeGraphs", () => {
  it("adds new moves, unions annotations, and keeps the shallowest ply", () => {
    const base = importPgn("1. e4 e5 *", "white").graph;
    const incoming = importPgn("1. e4 e5 2. Nf3 Nc6 *", "white").graph;
    const merged = mergeGraphs(base, incoming);
    expect(Object.keys(merged.edges).length).toBe(Object.keys(incoming.edges).length);
    expect(merged.roots).toEqual(base.roots);
  });

  it("never resurrects a deliberately deleted move unless it is named in the restore set", () => {
    const base = importPgn("1. e4 e5 2. Nf3 *", "white").graph;
    const target = Object.values(base.edges).find((edge) => edge.san === "Nf3")!;
    const pruned = softDeleteEdge(base, target.id);
    const incoming = importPgn("1. e4 e5 2. Nf3 Nc6 *", "white").graph;

    expect(restorableDeletedEdgeIds(pruned, incoming)).toEqual([target.id]);

    const kept = mergeGraphs(pruned, incoming);
    expect(kept.edges[target.id].deletedAt).toBeTruthy();

    const restored = mergeGraphs(pruned, incoming, new Set([target.id]));
    expect(restored.edges[target.id].deletedAt).toBeUndefined();
  });

  it("reports nothing restorable when the base has no deletions", () => {
    const base = importPgn("1. e4 e5 *", "white").graph;
    expect(restorableDeletedEdgeIds(base, importPgn("1. e4 e5 2. Nf3 *", "white").graph)).toEqual([]);
  });

  it("leaves the base graph untouched", () => {
    const base = importPgn("1. e4 e5 *", "white").graph;
    const snapshot = structuredClone(base);
    mergeGraphs(base, importPgn("1. d4 d5 *", "white").graph);
    expect(base).toEqual(snapshot);
  });
});
