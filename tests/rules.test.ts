import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import {
  checkedKingSquare,
  describePosition,
  gameResult,
  isCheckmate,
  isTerminal,
  legalMoves,
  playUci,
  START_FEN,
} from "@/lib/chess/rules";

describe("chess rules wrapper", () => {
  it("handles both castling directions", () => {
    const fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
    const kingMoves = legalMoves(fen, "e1").map((move) => move.uci);
    expect(kingMoves).toEqual(expect.arrayContaining(["e1g1", "e1c1"]));
    expect(playUci(fen, "e1g1").san).toBe("O-O");
  });

  it("supports promotion and every underpromotion", () => {
    const moves = legalMoves("8/P7/8/8/8/8/7p/4K2k w - - 0 1", "a7").map((move) => move.uci);
    expect(moves).toEqual(expect.arrayContaining(["a7a8q", "a7a8r", "a7a8b", "a7a8n"]));
  });

  it("reports checkmate", () => {
    const chess = new Chess();
    chess.move("f3"); chess.move("e5"); chess.move("g4"); chess.move("Qh4#");
    expect(gameResult(chess.fen())).toBe("Black won by checkmate");
  });

  it("keeps randomly selected legal sequences valid", () => {
    for (let sample = 0; sample < 20; sample += 1) {
      const chess = new Chess();
      for (let ply = 0; ply < 80 && !chess.isGameOver(); ply += 1) {
        const moves = chess.moves({ verbose: true });
        const move = moves[(sample * 17 + ply * 31) % moves.length];
        const played = playUci(chess.fen(), `${move.from}${move.to}${move.promotion ?? ""}`);
        expect(() => new Chess(played.fen)).not.toThrow();
        chess.move(move);
      }
    }
  }, 15_000);

  it("rejects an illegal UCI move instead of returning a wrong position", () => {
    expect(() => playUci(START_FEN, "e2e5")).toThrow(/Illegal move/);
  });
});

describe("position status", () => {
  it("finds the king that is actually in check, and no square otherwise", () => {
    const scholars = "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4";
    expect(checkedKingSquare(scholars)).toBe("e8");
    expect(checkedKingSquare(START_FEN)).toBeUndefined();
  });

  it("describes whose move it is, the position's status, and how many replies exist", () => {
    expect(describePosition(START_FEN)).toBe("White to move. 20 legal moves.");
    expect(describePosition("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")).toContain(", checkmate");
    expect(describePosition("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")).toContain(", stalemate");
    expect(describePosition("rnbqkbnr/ppp1pppp/8/1B1p4/8/4P3/PPPP1PPP/RNBQK1NR b KQkq - 1 2")).toContain(", in check");
  });

  it("separates a finished game from a merely quiet one", () => {
    expect(isTerminal(START_FEN)).toBe(false);
    expect(isTerminal("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")).toBe(true);
    expect(isCheckmate("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")).toBe(false);
    expect(isCheckmate("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")).toBe(true);
  });
});

describe("gameResult", () => {
  it("names the winner of a checkmate from the side left to move", () => {
    expect(gameResult("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")).toBe("White won by checkmate");
  });

  it("distinguishes the ways a game can be drawn", () => {
    expect(gameResult("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")).toBe("Draw by stalemate");
    expect(gameResult("4k3/8/8/8/8/8/8/4K3 w - - 0 1")).toBe("Draw by insufficient material");
    expect(gameResult("4k3/8/8/8/8/8/4R3/4K3 w - - 100 60")).toBe("Draw by the fifty-move rule");
  });

  it("falls back to a neutral label for a position that is not over", () => {
    expect(gameResult(START_FEN)).toBe("Game complete");
  });
});
