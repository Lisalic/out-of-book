import { describe, expect, it } from "vitest";
import { figurineSan } from "@/lib/chess/notation";

describe("figurineSan", () => {
  it("swaps the piece letter for its glyph, keeping the rest of the move", () => {
    expect(figurineSan("Nf3")).toBe("♘f3");
    expect(figurineSan("Qxd8+")).toBe("♕xd8+");
    expect(figurineSan("Rae1")).toBe("♖ae1");
    expect(figurineSan("Bb5")).toBe("♗b5");
    expect(figurineSan("Kg1")).toBe("♔g1");
  });

  it("leaves pawn moves, castling, and promotions readable as written", () => {
    expect(figurineSan("e4")).toBe("e4");
    expect(figurineSan("exd5")).toBe("exd5");
    expect(figurineSan("O-O")).toBe("O-O");
    expect(figurineSan("O-O-O")).toBe("O-O-O");
    expect(figurineSan("a8=Q")).toBe("a8=Q");
  });

  it("returns an empty move untouched", () => {
    expect(figurineSan("")).toBe("");
  });
});
