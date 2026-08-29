import { describe, expect, it } from "vitest";
import { seededRandom } from "@/lib/chess/deviation";
import { MAX_ENGINE_ELO, MIN_ENGINE_ELO, moveTimeForStrength, sampleByScore, weightedCandidate } from "@/lib/chess/engine-strength";
import type { EngineCandidate } from "@/lib/chess/types";

const candidate = (uci: string, scoreCp: number): EngineCandidate => ({ uci, scoreCp, depth: 10, pv: [uci] });

describe("moveTimeForStrength", () => {
  it("gives weaker settings a shorter search budget than stronger ones", () => {
    const weak = moveTimeForStrength(MIN_ENGINE_ELO);
    const strong = moveTimeForStrength(MAX_ENGINE_ELO);
    expect(weak).toBeLessThan(strong);
    expect(weak).toBeGreaterThan(0);
  });

  it("clamps outside the supported range instead of extrapolating", () => {
    expect(moveTimeForStrength(100)).toBe(moveTimeForStrength(MIN_ENGINE_ELO));
    expect(moveTimeForStrength(5000)).toBe(moveTimeForStrength(MAX_ENGINE_ELO));
  });
});

describe("sampleByScore", () => {
  it("returns null for an empty candidate list", () => {
    expect(sampleByScore([], 100, 50, () => 0)).toBeNull();
  });

  it("excludes candidates that lose more than the cap to the best score", () => {
    const candidates = [candidate("a", 50), candidate("b", -100)];
    const result = sampleByScore(candidates, 30, 50, () => 0.99);
    expect(result?.uci).toBe("a");
  });

  it("is deterministic under a seeded random source", () => {
    const candidates = [candidate("a", 30), candidate("b", 20), candidate("c", 10)];
    const first = sampleByScore(candidates, 100, 60, seededRandom(7));
    const second = sampleByScore(candidates, 100, 60, seededRandom(7));
    expect(first).toEqual(second);
  });
});

describe("weightedCandidate", () => {
  it("almost always plays the best move at high strength", () => {
    const candidates = [candidate("best", 100), candidate("worse", -50)];
    const random = seededRandom(1);
    let bestCount = 0;
    for (let i = 0; i < 50; i += 1) {
      if (weightedCandidate(candidates, MAX_ENGINE_ELO, random)?.uci === "best") bestCount += 1;
    }
    expect(bestCount).toBe(50);
  });

  it("never returns a move outside the given candidates", () => {
    const candidates = [candidate("a", 40), candidate("b", 35), candidate("c", -10)];
    const random = seededRandom(3);
    for (let i = 0; i < 20; i += 1) {
      const picked = weightedCandidate(candidates, MIN_ENGINE_ELO, random);
      expect(candidates.map((c) => c.uci)).toContain(picked?.uci);
    }
  });
});
