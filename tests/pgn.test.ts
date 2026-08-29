import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { activeEdges, mergeGraphs, softDeleteEdge } from "@/lib/chess/graph";
import { importPgn, PgnImportError } from "@/lib/chess/pgn";
import { fenTurn } from "@/lib/chess/position-key";

const fixture = (name: string) => readFileSync(path.join(process.cwd(), "tests", "fixtures", "pgn", name), "utf8");

describe("PGN position graph import", () => {
  it("parses recursive variations, comments, NAGs, and multiple accepted moves", () => {
    const preview = importPgn(fixture("branching.pgn"), "white");
    const whiteBranches = Object.values(preview.graph.positions).find((position) =>
      fenTurn(position.fen) === "white" && activeEdges(preview.graph, position.id).filter((edge) => edge.isAccepted).length === 2,
    );
    expect(preview.gameCount).toBe(1);
    expect(preview.branchCount).toBeGreaterThanOrEqual(2);
    expect(whiteBranches).toBeDefined();
    const answers = activeEdges(preview.graph, whiteBranches!.id).filter((edge) => edge.isAccepted);
    expect(answers.map((edge) => edge.san)).toEqual(expect.arrayContaining(["Nf3", "Bc4"]));
    expect(answers.find((edge) => edge.san === "Nf3")?.comments).toContain("The main answer.");
    expect(answers.find((edge) => edge.san === "Bc4")?.nags).toContain(5);
  });

  it("merges positions reached by different move orders", () => {
    const preview = importPgn(fixture("transposition.pgn"), "white");
    expect(preview.gameCount).toBe(2);
    expect(preview.transpositionCount).toBeGreaterThanOrEqual(1);
    expect(preview.positionCount).toBeLessThan(13);
  });

  it("merges an imported graph into an existing board-built repertoire", () => {
    const first = importPgn("1. e4 e5 2. Nf3 *", "white").graph;
    const second = importPgn("1. e4 c5 2. Nf3 *", "white").graph;
    const merged = mergeGraphs(first, second);
    expect(activeEdges(merged, merged.roots[0]).map((edge) => edge.uci)).toEqual(["e2e4"]);
    const afterE4 = activeEdges(merged, merged.roots[0])[0].to;
    expect(activeEdges(merged, afterE4).map((edge) => edge.uci)).toEqual(expect.arrayContaining(["e7e5", "c7c5"]));
  });

  it("supports SetUp/FEN games", () => {
    const preview = importPgn(`[SetUp "1"]\n[FEN "8/P7/8/8/8/8/7p/4K2k w - - 0 1"]\n\n1. a8=N *`, "white");
    expect(Object.values(preview.graph.edges)[0].uci).toBe("a7a8n");
  });

  it("reports malformed moves atomically with game and ply", () => {
    expect(() => importPgn("1. e4 e5 2. KingToTheMoon *", "white"))
      .toThrowError(PgnImportError);
    expect(() => importPgn("1. e4 e5 2. KingToTheMoon *", "white"))
      .toThrow(/Game 1, ply 3/);
  });

  it("rejects a PGN whose start position differs from the target repertoire's root, instead of adding an unreachable second root", () => {
    const target = importPgn("1. e4 e5 *", "white").graph;
    const customStart = `[SetUp "1"]\n[FEN "8/8/8/8/8/8/8/4K2k w - - 0 1"]\n\n1. Kd2 *`;
    expect(() => importPgn(customStart, "white", { targetGraph: target })).toThrow(PgnImportError);
    expect(() => importPgn(customStart, "white", { targetGraph: target })).toThrow(/different position/);
  });

  it("counts, but does not silently restore, moves that were previously soft-deleted from the target repertoire", () => {
    const base = importPgn("1. e4 e5 2. Nf3 *", "white").graph;
    const knightEdge = Object.values(base.edges).find((edge) => edge.san === "Nf3")!;
    const withDeletion = softDeleteEdge(base, knightEdge.id);

    const reimported = importPgn("1. e4 e5 2. Nf3 *", "white", { targetGraph: withDeletion });
    expect(reimported.restoredMoveCount).toBe(1);

    const mergedWithoutRestore = mergeGraphs(withDeletion, reimported.graph);
    expect(mergedWithoutRestore.edges[knightEdge.id].deletedAt).toBeDefined();

    const mergedWithRestore = mergeGraphs(withDeletion, reimported.graph, new Set([knightEdge.id]));
    expect(mergedWithRestore.edges[knightEdge.id].deletedAt).toBeUndefined();
  });
});
