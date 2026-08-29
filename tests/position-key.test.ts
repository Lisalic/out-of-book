import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { positionKey } from "@/lib/chess/position-key";

describe("positionKey", () => {
  it("ignores halfmove and fullmove counters", () => {
    expect(positionKey("8/8/8/8/8/8/4K3/7k w - - 0 1"))
      .toBe(positionKey("8/8/8/8/8/8/4K3/7k w - - 47 92"));
  });

  it("preserves side to move and castling rights", () => {
    const base = "r3k2r/8/8/8/8/8/8/R3K2R";
    expect(positionKey(`${base} w KQkq - 0 1`)).not.toBe(positionKey(`${base} b KQkq - 0 1`));
    expect(positionKey(`${base} w KQkq - 0 1`)).not.toBe(positionKey(`${base} w Kq - 0 1`));
  });

  it("normalizes an unusable en-passant target but preserves a legal one", () => {
    expect(positionKey("8/8/8/8/4P3/8/8/4K2k b - e3 0 1")).toContain(" b - -");
    const legal = new Chess();
    legal.move("e4");
    legal.move("a6");
    legal.move("e5");
    legal.move("d5");
    expect(positionKey(legal.fen())).toContain(" w KQkq d6");
  });
});
