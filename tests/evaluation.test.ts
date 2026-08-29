import { describe, expect, it } from "vitest";
import { formatEvaluation } from "@/lib/chess/evaluation";

describe("evaluation formatting", () => {
  it("formats centipawn scores as signed pawns", () => {
    expect(formatEvaluation(37)).toBe("+0.4");
    expect(formatEvaluation(-140)).toBe("−1.4");
    expect(formatEvaluation(0)).toBe("+0.0");
  });

  it("formats mate scores with the distance to mate, not just a flat M", () => {
    expect(formatEvaluation(100_000 - 4)).toBe("+M4");
    expect(formatEvaluation(-(100_000 - 1))).toBe("−M1");
  });
});
