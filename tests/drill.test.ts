import { describe, expect, it } from "vitest";
import { planLineDeviation } from "@/lib/chess/drill";
import { repertoireLines } from "@/lib/chess/scheduling";
import { importPgn } from "@/lib/chess/pgn";

function lineFor(pgn: string) {
  const graph = importPgn(pgn, "white").graph;
  return { graph, line: repertoireLines(graph, "white")[0] };
}

describe("planLineDeviation", () => {
  it("plans an opponent deviation only when the chance fires", () => {
    const { graph, line } = lineFor("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *");
    expect(planLineDeviation(graph, line, "white", 0.1, () => 0.11)).toBeNull();
    expect(planLineDeviation(graph, line, "white", 0.1, () => 0)).not.toBeNull();
  });

  it("never proposes a deviation before the line's last decision position", () => {
    // The line has three White decisions (root, after 1...e5, after 2...Nc6) — a deviation
    // must land at or after the opponent's reply to the last one (ply 3, Bb5), never earlier.
    const { graph, line } = lineFor("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *");
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
