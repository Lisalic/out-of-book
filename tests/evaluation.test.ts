import { describe, expect, it } from "vitest";
import { formatEvaluation, whitePerspectiveCp } from "@/lib/chess/evaluation";
import { START_FEN } from "@/lib/chess/rules";
import { candidate } from "./helpers/fixtures";

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

const BLACK_TO_MOVE = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

describe("whitePerspectiveCp", () => {
  it("keeps a white-to-move score as reported", () => {
    const analysis = { bestMove: "e2e4", candidates: [candidate("e2e4", 45), candidate("d2d4", 30)] };
    expect(whitePerspectiveCp(analysis, START_FEN)).toBe(45);
  });

  it("negates a black-to-move score, since UCI reports it for the side to move", () => {
    const analysis = { bestMove: "e7e5", candidates: [candidate("e7e5", 45)] };
    expect(whitePerspectiveCp(analysis, BLACK_TO_MOVE)).toBe(-45);
  });

  it("scores the best move even when it is not the highest-listed candidate", () => {
    const analysis = { bestMove: "d2d4", candidates: [candidate("e2e4", 90), candidate("d2d4", 20)] };
    expect(whitePerspectiveCp(analysis, START_FEN)).toBe(20);
  });

  it("falls back to the first candidate when the best move is missing from the list", () => {
    const analysis = { bestMove: "g1f3", candidates: [candidate("e2e4", 60)] };
    expect(whitePerspectiveCp(analysis, START_FEN)).toBe(60);
  });

  it("reports no score at all rather than zero when the engine returned nothing", () => {
    expect(whitePerspectiveCp({ bestMove: "e2e4", candidates: [] }, START_FEN)).toBeNull();
  });
});
