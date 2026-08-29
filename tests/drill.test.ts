import { describe, expect, it } from "vitest";
import { planLineDeviation } from "@/lib/chess/drill";
import { buildRouteIndex, buildSessionLines } from "@/lib/chess/scheduling";
import { importPgn } from "@/lib/chess/pgn";

function lineFor(pgn: string, targetEdgeUcis: string[]) {
  const graph = importPgn(pgn, "white").graph;
  const routeIndex = buildRouteIndex(graph);
  const targetKey = [...routeIndex.entries()].find(([, route]) => route.join(",") === targetEdgeUcis.join(","))![0];
  return { graph, line: buildSessionLines(graph, [targetKey], routeIndex)[0] };
}

describe("planLineDeviation", () => {
  // The tested position is White's second decision, reached after 2...Nc6 — the route to it
  // is 4 plies; buildSessionLines extends the rest of the line (Bb5, a6) from the saved graph.
  const TARGET_ROUTE = ["e2e4", "e7e5", "g1f3", "b8c6"];

  it("plans an opponent deviation only when the chance fires", () => {
    const { graph, line } = lineFor("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *", TARGET_ROUTE);
    expect(planLineDeviation(graph, line, "white", 0.1, () => 0.11)).toBeNull();
    expect(planLineDeviation(graph, line, "white", 0.1, () => 0)).not.toBeNull();
  });

  it("never proposes a deviation before the line's tested decision position", () => {
    // A deviation must land on ply 3 (Bb5, the opponent's next reply after the tested
    // position) or later — never on ply 1 (e5), which precedes it.
    const { graph, line } = lineFor("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *", TARGET_ROUTE);
    for (let seed = 0; seed < 50; seed += 1) {
      const random = (() => {
        let calls = 0;
        const values = [0, seed / 50];
        return () => values[calls++] ?? 0.5;
      })();
      const ply = planLineDeviation(graph, line, "white", 1, random);
      if (ply !== null) expect(ply).toBeGreaterThanOrEqual(3);
    }
  });
});
