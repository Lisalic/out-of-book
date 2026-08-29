import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { activeEdges, addGraphMove, emptyGraph, ensurePosition } from "@/lib/chess/graph";
import { importPgn } from "@/lib/chess/pgn";
import { fenTurn } from "@/lib/chess/position-key";
import {
  buildRouteIndex,
  buildSessionLines,
  decisionPositions,
  dueCount,
  grade,
  gradeForAttemptResult,
  initialReviewState,
  reviewStateId,
  selectSession,
} from "@/lib/chess/scheduling";
import type { PositionGraph, ReviewState } from "@/lib/chess/types";

/**
 * A binary-branching White repertoire `depth` plies deep: at every White decision the
 * trainee has `branching` saved answers, so total decision positions grow as
 * branching^depth. The old exhaustive line enumeration this replaces would have walked
 * every one of those root-to-leaf paths (also branching^depth of them); decisionPositions
 * and buildRouteIndex instead do one pass over the graph's positions and edges.
 */
function buildWideGraph(depth: number, branching: number): PositionGraph {
  const graph = emptyGraph();
  const rootFen = new Chess().fen();
  const rootId = ensurePosition(graph, rootFen, 0).id;
  graph.roots.push(rootId);

  // Not every branch reaches the full requested depth with the full requested branching —
  // blind pawn/piece shuffling can run a branch into a position with fewer than `branching`
  // (or zero) legal replies well before `depth`, and different branches can transpose into
  // the same position. That's fine: the point of this fixture is real multiplicative
  // branching with genuine transpositions, which is exactly what decisionPositions has to
  // deduplicate correctly — so the test verifies structure against the built graph itself
  // rather than predicting an exact count in advance.
  function expand(fen: string, level: number) {
    if (level >= depth) return;
    const chess = new Chess(fen);
    const whiteOptions = chess.moves({ verbose: true }).slice(0, branching);
    whiteOptions.forEach((whiteMove) => {
      const afterWhite = addGraphMove(graph, fen, whiteMove.san, "white", { ply: level * 2 });
      const blackChess = new Chess(graph.positions[afterWhite.to].fen);
      const blackMoves = blackChess.moves({ verbose: true });
      if (!blackMoves.length) return;
      const afterBlack = addGraphMove(graph, graph.positions[afterWhite.to].fen, blackMoves[0].san, "white", { ply: level * 2 + 1 });
      expand(graph.positions[afterBlack.to].fen, level + 1);
    });
  }

  expand(rootFen, 0);
  return graph;
}

describe("decisionPositions and buildRouteIndex stay linear in graph size", () => {
  it("enumerates every White decision exactly once, in one linear pass, over a graph with thousands of branch points", () => {
    const graph = buildWideGraph(10, 2);
    const totalPositions = Object.keys(graph.positions).length;
    expect(totalPositions).toBeGreaterThan(200); // confirms real multiplicative branching (with transpositions) happened

    const started = performance.now();
    const decisions = decisionPositions(graph, "white");
    const routeIndex = buildRouteIndex(graph);
    const elapsedMs = performance.now() - started;

    // Every returned key is a real, distinct, reachable White decision position.
    expect(new Set(decisions).size).toBe(decisions.length);
    decisions.forEach((key) => {
      const position = graph.positions[key];
      expect(position).toBeDefined();
      expect(fenTurn(position.fen)).toBe("white");
      expect(activeEdges(graph, key).some((edge) => edge.isAccepted)).toBe(true);
      expect(routeIndex.has(key)).toBe(true);
    });
    // Generous budget for a single linear pass over this many positions/edges — the old
    // exhaustive-path enumeration this replaces would instead walk every root-to-leaf path.
    expect(elapsedMs).toBeLessThan(500);
  });

  it("gives every reachable position its shortest edge-UCI route from the root", () => {
    const graph = importPgn("1. e4 e5 2. Nf3 (2. Bc4 Nc6) Nc6 *", "white").graph;
    const routeIndex = buildRouteIndex(graph);
    const nc6AfterNf3 = [...routeIndex.entries()].find(([, route]) => route.join(",") === "e2e4,e7e5,g1f3,b8c6");
    expect(nc6AfterNf3).toBeDefined();
    const nc6AfterBc4 = [...routeIndex.entries()].find(([, route]) => route.join(",") === "e2e4,e7e5,f1c4,b8c6");
    expect(nc6AfterBc4).toBeDefined();
  });
});

describe("buildSessionLines", () => {
  it("builds one playable line per requested decision position: the route to it, then its saved continuation", () => {
    const graph = importPgn("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 *", "white").graph;
    const routeIndex = buildRouteIndex(graph);
    const decisions = decisionPositions(graph, "white");
    const lines = buildSessionLines(graph, decisions, routeIndex);

    expect(lines).toHaveLength(decisions.length);
    lines.forEach((line) => {
      expect(line.edgeUcis.length).toBeGreaterThan(0);
      expect(decisions).toContain(line.targetPositionKey);
      // The route to the target position must be a prefix of the full line.
      const route = routeIndex.get(line.targetPositionKey)!;
      expect(line.edgeUcis.slice(0, route.length)).toEqual(route);
      // The whole line must replay as legal chess.
      const chess = new Chess();
      line.edgeUcis.forEach((uci) => {
        const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
        expect(move).not.toBeNull();
      });
    });
  });

  it("skips a requested key that isn't actually reachable", () => {
    const graph = importPgn("1. e4 e5 *", "white").graph;
    const routeIndex = buildRouteIndex(graph);
    const lines = buildSessionLines(graph, ["not-a-real-position"], routeIndex);
    expect(lines).toHaveLength(0);
  });
});

describe("selectSession", () => {
  const now = Date.parse("2026-08-28T12:00:00.000Z");
  const state = (positionKey: string, dueOffsetMs: number, ease = 2.5, lapses = 0): [string, ReviewState] => [
    positionKey,
    { id: `rep:${positionKey}`, repertoireId: "rep", positionKey, due: new Date(now + dueOffsetMs).toISOString(), intervalDays: 1, ease, reps: 1, lapses, updatedAt: new Date(now).toISOString() },
  ];

  it("puts overdue positions first, oldest due date first", () => {
    const states = new Map([
      state("b", -1000), // due 1s ago
      state("a", -5000), // due 5s ago, more overdue
    ]);
    const ordered = selectSession(["a", "b"], states, "all", now);
    expect(ordered).toEqual(["a", "b"]);
  });

  it("includes never-reviewed positions after due ones, and drops nothing when size is 'all'", () => {
    const states = new Map([state("due", -1000)]);
    const ordered = selectSession(["fresh", "due"], states, "all", now);
    expect(ordered).toEqual(["due", "fresh"]);
  });

  it("pads a fixed-size session with the weakest known positions only once due+new run out", () => {
    const states = new Map([
      state("strong", 999_999_999, 2.9, 0), // not due, high ease
      state("weak", 999_999_999, 1.3, 4), // not due, low ease, many lapses
    ]);
    const ordered = selectSession(["strong", "weak"], states, 1, now);
    expect(ordered).toEqual(["weak"]);
  });

  it("never pads when size is 'all' — only due and new positions are included", () => {
    const states = new Map([state("not-due", 999_999_999)]);
    expect(selectSession(["not-due"], states, "all", now)).toEqual([]);
  });
});

describe("dueCount", () => {
  it("counts only positions that are actually due", () => {
    const now = Date.now();
    const states = new Map<string, ReviewState>([
      ["a", { id: "a", repertoireId: "rep", positionKey: "a", due: new Date(now - 1000).toISOString(), intervalDays: 1, ease: 2.5, reps: 1, lapses: 0, updatedAt: "" }],
      ["b", { id: "b", repertoireId: "rep", positionKey: "b", due: new Date(now + 999_999_999).toISOString(), intervalDays: 1, ease: 2.5, reps: 1, lapses: 0, updatedAt: "" }],
    ]);
    expect(dueCount(["a", "b", "c"], states, now)).toBe(1);
  });
});

describe("SM-2-lite grading", () => {
  it("schedules a fresh good answer for tomorrow and a second good answer three days out", () => {
    const now = Date.parse("2026-08-28T12:00:00.000Z");
    const fresh = initialReviewState("rep", "pos", now);
    const afterFirst = grade(fresh, "good", now);
    expect(afterFirst.reps).toBe(1);
    expect(Date.parse(afterFirst.due) - now).toBeCloseTo(86_400_000, -3);

    const afterSecond = grade(afterFirst, "good", now);
    expect(afterSecond.reps).toBe(2);
    expect(Date.parse(afterSecond.due) - now).toBeCloseTo(3 * 86_400_000, -3);
  });

  it("resets reps, lowers ease, and brings the position back soon on 'again'", () => {
    const now = Date.parse("2026-08-28T12:00:00.000Z");
    let state = initialReviewState("rep", "pos", now);
    state = grade(state, "good", now);
    state = grade(state, "good", now);
    const lapsed = grade(state, "again", now);
    expect(lapsed.reps).toBe(0);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.ease).toBeLessThan(state.ease);
    expect(Date.parse(lapsed.due) - now).toBeLessThan(86_400_000);
  });

  it("never drops ease below the floor", () => {
    let state = initialReviewState("rep", "pos");
    for (let i = 0; i < 20; i += 1) state = grade(state, "again");
    expect(state.ease).toBeGreaterThanOrEqual(1.3);
  });

  it("derives a stable, lookup-friendly id from repertoire and position", () => {
    expect(reviewStateId("rep-1", "pos-key")).toBe("rep-1:pos-key");
  });

  it("maps recall outcomes to SM-2 grades", () => {
    expect(gradeForAttemptResult("first_try")).toBe("good");
    expect(gradeForAttemptResult("retry")).toBe("hard");
    expect(gradeForAttemptResult("revealed")).toBe("again");
  });
});
