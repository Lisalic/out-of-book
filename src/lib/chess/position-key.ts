import { Chess } from "chess.js";

/** Canonical position identity: FEN without move counters. */
export function positionKey(fen: string): string {
  const normalized = new Chess(fen).fen();
  return normalized.split(" ").slice(0, 4).join(" ");
}

export function fenTurn(fen: string): "white" | "black" {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

/** The FEN's fullmove number, defaulting to 1 for a FEN that omits or malforms the field. */
export function fenMoveNumber(fen: string): number {
  return Number(fen.split(" ")[5]) || 1;
}
