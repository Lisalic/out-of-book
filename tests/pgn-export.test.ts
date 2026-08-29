import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { activeEdges } from "@/lib/chess/graph";
import { importPgn } from "@/lib/chess/pgn";
import { exportPgn } from "@/lib/chess/pgn-export";
import type { PositionGraph } from "@/lib/chess/types";

const fixture = (name: string) => readFileSync(path.join(process.cwd(), "tests", "fixtures", "pgn", name), "utf8");

/** Collects every (san, comments, nags, isAccepted) tuple reachable from the root, order-independent. */
function fingerprint(graph: PositionGraph): Set<string> {
  const seen = new Set<string>();
  function visit(positionId: string, visited: Set<string>) {
    activeEdges(graph, positionId).forEach((edge) => {
      seen.add(JSON.stringify([edge.san, [...edge.comments].sort(), [...edge.nags].sort(), edge.isAccepted]));
      if (!visited.has(edge.to)) visit(edge.to, new Set([...visited, edge.to]));
    });
  }
  graph.roots.forEach((root) => visit(root, new Set([root])));
  return seen;
}

describe("PGN export", () => {
  it("round-trips a branching repertoire with comments and NAGs through import(export(graph))", () => {
    const original = importPgn(fixture("branching.pgn"), "white").graph;
    const pgn = exportPgn(original);
    const roundTripped = importPgn(pgn, "white").graph;
    expect(fingerprint(roundTripped)).toEqual(fingerprint(original));
  });

  it("round-trips a repertoire with transpositions", () => {
    const original = importPgn(fixture("transposition.pgn"), "white").graph;
    const roundTripped = importPgn(exportPgn(original), "white").graph;
    expect(fingerprint(roundTripped)).toEqual(fingerprint(original));
  });

  it("emits SetUp/FEN headers for a non-standard starting position, and round-trips it", () => {
    const original = importPgn(`[SetUp "1"]\n[FEN "8/P7/8/8/8/8/7p/4K2k w - - 0 1"]\n\n1. a8=N *`, "white").graph;
    const pgn = exportPgn(original);
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain("4K2k");
    const roundTripped = importPgn(pgn, "white").graph;
    expect(fingerprint(roundTripped)).toEqual(fingerprint(original));
  });

  it("exports an empty repertoire as an empty game rather than throwing", () => {
    const empty = importPgn("1. e4 *", "white").graph;
    empty.roots = [];
    expect(exportPgn(empty).trim()).toBe("*");
  });
});
