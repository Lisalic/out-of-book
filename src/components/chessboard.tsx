"use client";

import { Chess, type Square } from "chess.js";
import { type RefObject, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Chessboard as ReactChessboard, type ChessboardOptions } from "react-chessboard";
import { checkedKingSquare, describePosition, legalMoves } from "@/lib/chess/rules";
import { useBoardPalette } from "./use-board-theme";
import type { TraineeColor } from "@/lib/chess/types";

/** Thickness of the coordinate gutters that sit outside the board, in px. */
const RAIL_PX = 20;
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

interface BoardMetrics {
  /** Board edge length in px: always a whole number, and always a multiple of 8. */
  size: number;
  /** Horizontal nudge that lands the board's left edge on a whole pixel. */
  offset: number;
}

/**
 * react-chessboard lays its squares out with `repeat(8, 1fr)`, so a board sized by its
 * container gets fractional squares — at the editor's 554px that is 69.25px a square, and
 * every seam, notation glyph and piece outline falls on a different fraction of a device
 * pixel. The board renders soft and visibly uneven. Rounding the board down to a multiple
 * of 8 makes every square an identical whole number of pixels, and nudging it onto a whole
 * pixel puts all nine seams on the device grid.
 */
function useCrispBoard(ref: RefObject<HTMLDivElement | null>): BoardMetrics {
  const [metrics, setMetrics] = useState<BoardMetrics>({ size: 0, offset: 0 });

  useLayoutEffect(() => {
    const track = ref.current;
    if (!track) return;

    function measure() {
      const rect = (track as HTMLDivElement).getBoundingClientRect();
      const size = Math.max(8, Math.floor((rect.width - RAIL_PX) / 8) * 8);
      // Centre the board in whatever the rounding left over, then pull it back onto a
      // whole pixel. The nudge moves the board, never the track we just measured, so
      // this cannot feed back into the observer.
      const centred = (rect.width - RAIL_PX - size) / 2;
      const offset = centred - ((rect.left + RAIL_PX + centred) % 1);
      setMetrics((current) =>
        current.size === size && Math.abs(current.offset - offset) < 0.01 ? current : { size, offset },
      );
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [ref]);

  return metrics;
}

interface ChessboardProps {
  fen: string;
  orientation?: TraineeColor;
  interactive?: boolean;
  lastMove?: string;
  /** A legal-but-rejected move to flag on the board (from/to tint) without changing the position. */
  rejectedMove?: string;
  onMove?: (uci: string) => void;
}

export function Chessboard({
  fen,
  orientation = "white",
  interactive = true,
  lastMove,
  rejectedMove,
  onMove,
}: ChessboardProps) {
  const chess = useMemo(() => new Chess(fen), [fen]);
  const trackRef = useRef<HTMLDivElement>(null);
  const { size, offset } = useCrispBoard(trackRef);
  const boardId = useId();
  const palette = useBoardPalette();
  const [selection, setSelection] = useState<{ fen: string; square: Square }>();
  const [promotion, setPromotion] = useState<{ fen: string; from: Square; to: Square }>();
  const selected = selection?.fen === fen ? selection.square : undefined;
  const activePromotion = promotion?.fen === fen ? promotion : undefined;
  const destinations = selected ? legalMoves(fen, selected).map((move) => move.to) : [];
  const checkedSquare = useMemo(() => checkedKingSquare(fen), [fen]);

  function attempt(from: Square, to: Square): boolean {
    if (!interactive) return false;
    const matches = legalMoves(fen, from).filter((move) => move.to === to);
    if (!matches.length) {
      const piece = chess.get(to);
      setSelection(piece?.color === chess.turn() ? { fen, square: to } : undefined);
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
    showNotation: false,
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

  const files = orientation === "white" ? FILES : [...FILES].reverse();
  const ranks = orientation === "white" ? RANKS : [...RANKS].reverse();

  return (
    <div className="relative w-full">
      <div ref={trackRef} className="w-full">
        <div className="flex" style={{ marginLeft: offset }}>
          {/* Coordinates live outside the board so nothing overlaps the pieces. */}
          <div
            aria-hidden="true"
            className="flex flex-col text-ink-faint"
            style={{ width: RAIL_PX, height: size }}
          >
            {ranks.map((rank) => (
              <span key={rank} className="mono flex flex-1 items-center justify-center text-[10px] font-bold tabular-nums">
                {rank}
              </span>
            ))}
          </div>
          <div className="bg-canvas [&>div]:h-full [&>div]:w-full" style={{ width: size, height: size }}>
            <ReactChessboard options={options} />
          </div>
        </div>
        <div className="flex" style={{ marginLeft: offset }} aria-hidden="true">
          <div style={{ width: RAIL_PX }} />
          <div className="flex text-ink-faint" style={{ width: size, height: RAIL_PX }}>
            {files.map((file) => (
              <span key={file} className="mono flex flex-1 items-center justify-center text-[10px] font-bold">
                {file}
              </span>
            ))}
          </div>
        </div>
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
