import { describe, expect, it } from "vitest";
import { selectDeviation, seededRandom } from "@/lib/chess/deviation";
import type { EngineCandidate } from "@/lib/chess/types";

const candidate = (uci: string, scoreCp: number): EngineCandidate => ({ uci, scoreCp, depth: 10, pv: [uci] });

describe("deviation selection", () => {
  it("never selects a saved or illegal move", () => {
    const selected = selectDeviation(
      [candidate("e7e5", 25), candidate("c7c5", 12), candidate("a7a5", -30), candidate("h9h8", 20)],
      ["e7e5"],
      ["e7e5", "c7c5", "a7a5"],
      1500,
      seededRandom(42),
    );
    expect(selected?.uci).not.toBe("e7e5");
    expect(["c7c5", "a7a5"]).toContain(selected?.uci);
  });

  it("rejects implausibly large losses for a strong opponent", () => {
    const selected = selectDeviation(
      [candidate("c7c5", 20), candidate("a7a5", -500)],
      [],
      ["c7c5", "a7a5"],
      2100,
      seededRandom(9),
    );
    expect(selected?.uci).toBe("c7c5");
  });

  it("is deterministic under a seeded random source", () => {
    const candidates = [candidate("c7c5", 20), candidate("g8f6", 15), candidate("d7d5", 5)];
    const first = selectDeviation(candidates, [], candidates.map((item) => item.uci), 1400, seededRandom(123));
    const second = selectDeviation(candidates, [], candidates.map((item) => item.uci), 1400, seededRandom(123));
    expect(first).toEqual(second);
  });
});
