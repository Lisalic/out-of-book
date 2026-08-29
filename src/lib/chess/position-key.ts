import { Chess } from "chess.js";

/** Canonical position identity: FEN without move counters. */
export function positionKey(fen: string): string {
  const normalized = new Chess(fen).fen();
  return normalized.split(" ").slice(0, 4).join(" ");
}

export function fenTurn(fen: string): "white" | "black" {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}
