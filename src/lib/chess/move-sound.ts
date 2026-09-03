import { Chess, type Move } from "chess.js";
import { positionKey } from "./position-key";

export type MoveSound = "move" | "capture" | "castle" | "check" | "promotion" | "game-end";

function soundFor(move: Move, position: Chess): MoveSound {
  if (position.isGameOver()) return "game-end";
  if (position.inCheck()) return "check";
  if (move.isPromotion()) return "promotion";
  if (move.isKingsideCastle() || move.isQueensideCastle()) return "castle";
  if (move.isCapture() || move.isEnPassant()) return "capture";
  return "move";
}

function fenPly(fen: string): number {
  const fields = fen.split(" ");
  return (Number(fields[5]) - 1) * 2 + (fields[1] === "b" ? 1 : 0);
}

function classifyForward(before: string, after: string, uci?: string): MoveSound | undefined {
  try {
    const target = positionKey(after);
    const source = new Chess(before);
    const moves = uci
      ? source.moves({ verbose: true }).filter((move) => `${move.from}${move.to}${move.promotion ?? ""}` === uci)
      : source.moves({ verbose: true });

    for (const move of moves) {
      const position = new Chess(before);
      const applied = position.move({ from: move.from, to: move.to, promotion: move.promotion });
      if (positionKey(position.fen()) === target) return soundFor(applied, position);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function classifyPositionTransition(previousFen: string, nextFen: string, uci?: string): MoveSound | undefined {
  try {
    if (positionKey(previousFen) === positionKey(nextFen)) return undefined;
    if (!uci && Math.abs(fenPly(previousFen) - fenPly(nextFen)) !== 1) return undefined;
    return classifyForward(previousFen, nextFen, uci) ?? classifyForward(nextFen, previousFen, uci);
  } catch {
    return undefined;
  }
}
