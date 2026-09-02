import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { classifyPositionTransition } from "@/lib/chess/move-sound";

function play(fen: string, move: string): string {
  const chess = new Chess(fen);
  chess.move(move);
  return chess.fen();
}

function positionAfter(moves: string[]): string {
  const chess = new Chess();
  moves.forEach((move) => chess.move(move));
  return chess.fen();
}

describe("move sound classification", () => {
  it("classifies ordinary moves and captures", () => {
    const start = new Chess().fen();
    const afterE4 = play(start, "e4");
    const afterD5 = play(afterE4, "d5");

    expect(classifyPositionTransition(start, afterE4)).toBe("move");
    expect(classifyPositionTransition(afterD5, play(afterD5, "exd5"))).toBe("capture");
  });

  it("classifies castling and promotion", () => {
    const beforeCastle = positionAfter(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"]);
    const beforePromotion = "7k/P1p5/8/8/8/8/8/7K w - - 0 1";

    expect(classifyPositionTransition(beforeCastle, play(beforeCastle, "O-O"))).toBe("castle");
    expect(classifyPositionTransition(beforePromotion, play(beforePromotion, "a8=N"))).toBe("promotion");
  });

  it("gives check and game end priority over the move type", () => {
    const beforeCheck = positionAfter(["e4", "e5", "Bc4", "Nc6"]);
    const beforeMate = positionAfter(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6"]);

    expect(classifyPositionTransition(beforeCheck, play(beforeCheck, "Bxf7+"))).toBe("check");
    expect(classifyPositionTransition(beforeMate, play(beforeMate, "Qxf7#"))).toBe("game-end");
  });

  it("recognizes en passant as a capture", () => {
    const before = positionAfter(["e4", "a6", "e5", "d5"]);
    expect(classifyPositionTransition(before, play(before, "exd6"))).toBe("capture");
  });

  it("classifies a backward step as the original forward move", () => {
    const before = positionAfter(["e4", "d5"]);
    const after = play(before, "exd5");
    expect(classifyPositionTransition(after, before)).toBe("capture");
  });

  it("ignores stale move counters on a valid graph edge", () => {
    const start = new Chess().fen();
    const fields = play(start, "e4").split(" ");
    fields[4] = "27";
    fields[5] = "18";
    expect(classifyPositionTransition(start, fields.join(" "), "e2e4")).toBe("move");
  });

  it("does not mistake a cyclic multi-ply jump for one move", () => {
    const start = new Chess().fen();
    const afterCycle = positionAfter(["Nf3", "Nf6", "Ng1", "Ng8", "e4"]);
    expect(classifyPositionTransition(start, afterCycle)).toBeUndefined();
  });

  it("stays silent for unchanged, invalid, and multi-ply transitions", () => {
    const start = new Chess().fen();
    const twoPlies = positionAfter(["e4", "e5"]);
    const unrelated = new Chess("7k/8/8/8/8/8/8/K7 w - - 0 1").fen();

    expect(classifyPositionTransition(start, start)).toBeUndefined();
    expect(classifyPositionTransition(start, twoPlies)).toBeUndefined();
    expect(classifyPositionTransition(start, unrelated)).toBeUndefined();
    expect(classifyPositionTransition(start, "not a fen")).toBeUndefined();
  });
});
