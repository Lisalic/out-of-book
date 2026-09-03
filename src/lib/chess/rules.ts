import { Chess, type Move, type Square } from "chess.js";

export const START_FEN = new Chess().fen();

export interface LegalMove {
  from: Square;
  to: Square;
  san: string;
  uci: string;
  promotion?: string;
}

export function moveToUci(move: Pick<Move, "from" | "to" | "promotion">): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export function legalMoves(fen: string, from?: Square): LegalMove[] {
  const chess = new Chess(fen);
  return chess.moves({ square: from, verbose: true }).map((move) => ({
    from: move.from,
    to: move.to,
    san: move.san,
    uci: moveToUci(move),
    promotion: move.promotion,
  }));
}

export function playUci(fen: string, uci: string): { fen: string; san: string; uci: string } {
  const chess = new Chess(fen);
  // chess.js signals an illegal move by throwing its own parse error rather than returning
  // null; both are normalized here so callers see one message naming the move they sent.
  let move;
  try {
    move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4, 5) || undefined,
    });
  } catch {
    move = undefined;
  }
  if (!move) throw new Error(`Illegal move: ${uci}`);
  return { fen: chess.fen(), san: move.san, uci: moveToUci(move) };
}

/** Square of the king currently in check, if any — for the board's check highlight. */
export function checkedKingSquare(fen: string): Square | undefined {
  const chess = new Chess(fen);
  if (!chess.inCheck()) return undefined;
  const turn = chess.turn();
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece && piece.type === "k" && piece.color === turn) return piece.square;
    }
  }
  return undefined;
}

export function describePosition(fen: string): string {
  const chess = new Chess(fen);
  const turn = chess.turn() === "w" ? "White" : "Black";
  const suffix = chess.isCheckmate()
    ? ", checkmate"
    : chess.isStalemate()
      ? ", stalemate"
      : chess.inCheck()
        ? ", in check"
        : "";
  return `${turn} to move${suffix}. ${chess.moves().length} legal moves.`;
}

export function isTerminal(fen: string): boolean {
  return new Chess(fen).isGameOver();
}

export function isCheckmate(fen: string): boolean {
  return new Chess(fen).isCheckmate();
}

export function gameResult(fen: string): string {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return chess.turn() === "w" ? "Black won by checkmate" : "White won by checkmate";
  if (chess.isStalemate()) return "Draw by stalemate";
  if (chess.isThreefoldRepetition()) return "Draw by repetition";
  if (chess.isInsufficientMaterial()) return "Draw by insufficient material";
  if (chess.isDrawByFiftyMoves()) return "Draw by the fifty-move rule";
  return "Game complete";
}
