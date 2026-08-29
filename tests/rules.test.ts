import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { gameResult, legalMoves, playUci } from "@/lib/chess/rules";

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
  });
});
