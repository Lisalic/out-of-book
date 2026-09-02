"use client";

import { Chess, type Square } from "chess.js";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Chessboard as ReactChessboard, type ChessboardOptions } from "react-chessboard";
import { playBoardSound, unlockBoardSound } from "./board-sound";
import { checkedKingSquare, describePosition, legalMoves } from "@/lib/chess/rules";
import { classifyPositionTransition } from "@/lib/chess/move-sound";
import { useBoardPalette } from "./use-board-theme";
import type { TraineeColor } from "@/lib/chess/types";

interface ChessboardProps {
  fen: string;
  orientation?: TraineeColor;
  interactive?: boolean;
  lastMove?: string;
  /** Exact traversed move for graph edges with stale FEN counters; null explicitly silences a jump. */
  soundMove?: string | null;
  /** A legal-but-rejected move to flag on the board (from/to tint) without changing the position. */
  rejectedMove?: string;
  onMove?: (uci: string) => void;
}

export function Chessboard({
  fen,
  orientation = "white",
  interactive = true,
  lastMove,
  soundMove,
  rejectedMove,
  onMove,
}: ChessboardProps) {
  const chess = useMemo(() => new Chess(fen), [fen]);
  const boardId = useId();
  const palette = useBoardPalette();
  const [selection, setSelection] = useState<{ fen: string; square: Square }>();
  const [promotion, setPromotion] = useState<{ fen: string; from: Square; to: Square }>();
  const previousFen = useRef(fen);
  const previousRejectedMove = useRef(rejectedMove);
  const selected = selection?.fen === fen ? selection.square : undefined;
  const activePromotion = promotion?.fen === fen ? promotion : undefined;
  const destinations = selected ? legalMoves(fen, selected).map((move) => move.to) : [];
  const checkedSquare = useMemo(() => checkedKingSquare(fen), [fen]);

  useEffect(() => {
    const sound = soundMove === null ? undefined : classifyPositionTransition(previousFen.current, fen, soundMove);
    previousFen.current = fen;
    if (sound) playBoardSound(sound);
  }, [fen, soundMove]);

  useEffect(() => {
    if (rejectedMove && rejectedMove !== previousRejectedMove.current) playBoardSound("rejected");
    previousRejectedMove.current = rejectedMove;
  }, [rejectedMove]);

  function attempt(from: Square, to: Square): boolean {
    if (!interactive) return false;
    unlockBoardSound();
    const matches = legalMoves(fen, from).filter((move) => move.to === to);
    if (!matches.length) {
      const piece = chess.get(to);
      if (piece?.color === chess.turn()) setSelection({ fen, square: to });
      else {
        setSelection(undefined);
        playBoardSound("illegal");
      }
      return false;
    }
    if (matches.some((move) => move.promotion)) {
      setPromotion({ fen, from, to });
      return false;
    }
    setSelection(undefined);
    onMove?.(matches[0].uci);
    return true;
  }

  const squareStyles: NonNullable<ChessboardOptions["squareStyles"]> = {};
  if (lastMove) {
    squareStyles[lastMove.slice(0, 2)] = { backgroundColor: palette.highlight };
    squareStyles[lastMove.slice(2, 4)] = { backgroundColor: palette.highlight };
  }
  if (checkedSquare) {
    squareStyles[checkedSquare] = { ...squareStyles[checkedSquare], boxShadow: `inset 0 0 0 4px ${palette.check}` };
  }
  if (rejectedMove) {
    const from = rejectedMove.slice(0, 2);
    const to = rejectedMove.slice(2, 4);
    squareStyles[from] = { ...squareStyles[from], boxShadow: "inset 0 0 0 3px var(--color-danger)" };
    squareStyles[to] = { ...squareStyles[to], boxShadow: "inset 0 0 0 3px var(--color-danger)" };
  }
  if (selected) {
    squareStyles[selected] = { backgroundColor: palette.highlight };
    destinations.forEach((square) => {
      squareStyles[square] = chess.get(square)
        ? { boxShadow: "inset 0 0 0 5px rgba(48, 46, 43, .34)" }
        : { backgroundImage: "radial-gradient(circle, rgba(48, 46, 43, .32) 0 16%, transparent 17%)" };
    });
  }

  const options: ChessboardOptions = {
    id: `board-${boardId}`,
    position: fen,
    boardOrientation: orientation,
    allowDragging: interactive,
    allowDrawingArrows: false,
    showAnimations: true,
    animationDurationInMs: 140,
    showNotation: true,
    lightSquareStyle: { backgroundColor: palette.light },
    darkSquareStyle: { backgroundColor: palette.dark },
    boardStyle: { borderRadius: "0", boxShadow: "none", overflow: "hidden" },
    squareStyles,
    canDragPiece: ({ piece }) => interactive && piece.pieceType.startsWith(chess.turn()),
    onPieceDrop: ({ sourceSquare, targetSquare }) =>
      targetSquare ? attempt(sourceSquare as Square, targetSquare as Square) : false,
    onSquareClick: ({ square }) => {
      if (!interactive) return;
      const target = square as Square;
      if (selected) attempt(selected, target);
      else if (chess.get(target)?.color === chess.turn()) setSelection({ fen, square: target });
    },
  };

  return (
    <div className="relative w-full">
      <div className="aspect-square w-full bg-canvas [&>div]:h-full [&>div]:w-full">
        <ReactChessboard options={options} />
      </div>
      <p className="sr-only" aria-live="polite">{describePosition(fen)}</p>
      {activePromotion && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose promotion piece"
          className="absolute inset-0 z-20 grid place-items-center bg-canvas/70 p-4"
        >
          <div className="w-full max-w-xs bg-surface-sunken p-5 text-center">
            <p className="mb-3 text-sm font-semibold">Choose a promotion piece</p>
            <div className="grid grid-cols-4 gap-2">
              {(["q", "r", "b", "n"] as const).map((piece) => {
                const label = piece === "q" ? "Queen" : piece === "r" ? "Rook" : piece === "b" ? "Bishop" : "Knight";
                return (
                  <button
                    key={piece}
                    type="button"
                    className="flex min-h-16 flex-col items-center justify-center gap-1 bg-line text-2xl hover:bg-accent hover:text-accent-ink"
                    onClick={() => {
                      setPromotion(undefined);
                      onMove?.(`${activePromotion.from}${activePromotion.to}${piece}`);
                    }}
                  >
                    <strong>{piece.toUpperCase()}</strong>
                    <span className="text-[9px] font-normal text-ink-muted">{label}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="btn btn-quiet mt-3 w-full" onClick={() => setPromotion(undefined)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
