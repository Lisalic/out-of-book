import { fenMoveNumber, fenTurn } from "./position-key";

export interface MoveRow<T> {
  number: number;
  white?: T;
  black?: T;
}

/**
 * Groups a sequence of plies into the two-column rows a move list renders, keyed by the
 * position each ply was played *from* — so a line that starts on Black's move opens with
 * an empty White cell rather than shifting every later pair onto the wrong side.
 */
export function groupMoveRows<T>(plies: readonly T[], fenBefore: (ply: T) => string): Array<MoveRow<T>> {
  const rows: Array<MoveRow<T>> = [];
  plies.forEach((ply) => {
    const fen = fenBefore(ply);
    const number = fenMoveNumber(fen);
    const isWhite = fenTurn(fen) === "white";
    let row = rows.at(-1);
    // A new row starts on a new move number, and also when this ply would overwrite a
    // cell the previous ply already filled (repeated numbers across a variation boundary).
    if (!row || row.number !== number || (isWhite ? row.white : row.black) !== undefined) {
      row = { number };
      rows.push(row);
    }
    if (isWhite) row.white = ply;
    else row.black = ply;
  });
  return rows;
}
