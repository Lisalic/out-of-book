import { describe, expect, it } from "vitest";
import { groupMoveRows } from "@/lib/chess/move-rows";
import { START_FEN } from "@/lib/chess/rules";

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const AFTER_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";

describe("groupMoveRows", () => {
  it("pairs each White ply with the Black reply that followed it", () => {
    const rows = groupMoveRows(
      [
        { san: "e4", fen: START_FEN },
        { san: "e5", fen: AFTER_E4 },
        { san: "Nf3", fen: AFTER_E5 },
      ],
      (ply) => ply.fen,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ number: 1, white: { san: "e4" }, black: { san: "e5" } });
    expect(rows[1].number).toBe(2);
    expect(rows[1].white?.san).toBe("Nf3");
    expect(rows[1].black).toBeUndefined();
  });

  it("leaves the White cell empty for a line that starts on Black's move", () => {
    const rows = groupMoveRows([{ san: "e5", fen: AFTER_E4 }], (ply) => ply.fen);
    expect(rows).toHaveLength(1);
    expect(rows[0].white).toBeUndefined();
    expect(rows[0].black?.san).toBe("e5");
  });

  it("starts a new row rather than overwriting a cell already filled for that move number", () => {
    const rows = groupMoveRows(
      [
        { san: "e4", fen: START_FEN },
        { san: "d4", fen: START_FEN },
      ],
      (ply) => ply.fen,
    );
    expect(rows.map((row) => row.white?.san)).toEqual(["e4", "d4"]);
    expect(rows.every((row) => row.number === 1)).toBe(true);
  });

  it("returns no rows for no plies", () => {
    expect(groupMoveRows([], () => START_FEN)).toEqual([]);
  });
});
