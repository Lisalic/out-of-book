"use client";

import { useMemo, useState } from "react";
import { Chessboard } from "./chessboard";
import { MoveNavStrip } from "./move-nav";
import { useBoardFlip } from "./use-board-flip";
import { useBoardKeys } from "./use-board-keys";
import { activeEdges } from "@/lib/chess/graph";
import { formatEvaluation } from "@/lib/chess/evaluation";
import { MAX_ENGINE_ELO, MIN_ENGINE_ELO } from "@/lib/chess/engine-strength";
import { figurineSan } from "@/lib/chess/notation";
import type { DeviationFrequency, MoveLedgerEntry, Repertoire, TrainingSession } from "@/lib/chess/types";
import type { EngineStatus } from "./use-training-engine";

const FREQUENCIES: Array<{ value: DeviationFrequency; label: string; note: string; pct: string }> = [
  { value: "never", label: "Never", note: "Pure recall drilling", pct: "0%" },
  { value: "low", label: "Occasionally", note: "Recommended", pct: "10%" },
  { value: "medium", label: "Sometimes", note: "Every fourth line leaves book", pct: "25%" },
  { value: "high", label: "Often", note: "Sparring-heavy", pct: "50%" },
];

const SESSION_SIZES: Array<{ value: number | "all"; label: string }> = [
  { value: 10, label: "10" },
  { value: 20, label: "20" },
  { value: 40, label: "40" },
  { value: "all", label: "All due" },
];

const STRENGTH_STOPS: Array<{ value: number; tier: string }> = [
  { value: 1000, tier: "Beginner" },
  { value: 1400, tier: "Club" },
  { value: 1700, tier: "Advanced" },
  { value: 2000, tier: "Strong" },
  { value: 2200, tier: "Expert" },
];

interface PracticeSetupProps {
  repertoire: Repertoire;
  strength: number;
  frequency: DeviationFrequency;
  sessionSize: number | "all";
  decisionCount: number;
  dueCount: number;
  onBack: () => void;
  onStrengthChange: (strength: number) => void;
  onFrequencyChange: (frequency: DeviationFrequency) => void;
  onSessionSizeChange: (size: number | "all") => void;
  onStart: () => void;
}

export function PracticeSetup({
  repertoire,
  strength,
  frequency,
  sessionSize,
  decisionCount,
  dueCount,
  onBack,
  onStrengthChange,
  onFrequencyChange,
  onSessionSizeChange,
  onStart,
}: PracticeSetupProps) {
  const facts: Array<[string, string]> = [
    ["Due today", String(dueCount)],
    ["Decisions in book", String(decisionCount)],
    ["Playing as", repertoire.traineeColor],
  ];
  const nearestStop = STRENGTH_STOPS.reduce((best, stop) => (Math.abs(stop.value - strength) < Math.abs(best.value - strength) ? stop : best));

  return (
    <section className="mx-auto w-[min(1180px,calc(100%-56px))] flex-1">
      <header className="grid h-[72px] grid-cols-[1fr_auto_1fr] items-center gap-6">
        <button type="button" className="mono justify-self-start text-xs text-ink-muted hover:text-ink" onClick={onBack}>← Back to books</button>
        <span className="justify-self-center text-base font-semibold tracking-tight capitalize">{repertoire.name}</span>
        <span />
      </header>

      <div className="grid grid-cols-1 gap-0.5 lg:grid-cols-[1fr_480px]">
        <div className="py-9">
          <p className="eyebrow">Set the opponent</p>
          <h1 className="mt-4.5 text-[64px] leading-[0.9] font-bold tracking-tighter">HOW HARD SHOULD THIS BE?</h1>
          <div className="mt-11 flex flex-col gap-0.5">
            {facts.map(([label, value]) => (
              <div key={label} className="panel flex items-baseline justify-between gap-5 px-5.5 py-4.5">
                <span className="mono text-xs tracking-wide text-ink-muted uppercase">{label}</span>
                <span className="text-xl font-semibold tracking-tight capitalize">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          <div className="panel p-6.5">
            <div className="flex items-baseline justify-between">
              <p className="label">Engine strength</p>
              <p className="mono text-xs text-accent">≈{strength} · {nearestStop.tier.toLowerCase()}</p>
            </div>
            <input
              type="range"
              min={MIN_ENGINE_ELO}
              max={MAX_ENGINE_ELO}
              step="20"
              value={strength}
              onChange={(event) => onStrengthChange(Number(event.target.value))}
              className="mt-5 w-full accent-accent"
              aria-label="Opponent strength"
            />
            <div className="mt-4 flex gap-0.5">
              {STRENGTH_STOPS.map((stop) => (
                <button
                  key={stop.value}
                  type="button"
                  onClick={() => onStrengthChange(stop.value)}
                  className={`flex-1 py-3.5 text-center ${stop.value === nearestStop.value ? "bg-accent text-accent-ink" : "bg-line text-ink-muted hover:text-ink"}`}
                >
                  <p className="mono text-sm font-bold">{stop.value}</p>
                  <p className="mono mt-1 text-[9px] tracking-wide uppercase opacity-75">{stop.tier}</p>
                </button>
              ))}
            </div>
            <p className="mono mt-4 text-[11px] leading-relaxed text-ink-faint">Approximate — depends on your device.</p>
          </div>

          <div>
            <p className="label px-1 py-3">Chance this session leaves book</p>
            <div className="flex flex-col gap-0.5">
              {FREQUENCIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onFrequencyChange(option.value)}
                  className={`grid grid-cols-[1fr_auto] items-center gap-4 border-l-[6px] px-5 py-4.5 text-left ${
                    frequency === option.value ? "border-l-canvas bg-accent text-accent-ink" : "border-l-transparent bg-surface-sunken hover:bg-line"
                  }`}
                >
                  <span>
                    <span className="block text-xl font-semibold tracking-tight">{option.label}</span>
                    <span className="mono mt-0.5 block text-[11px] opacity-75">{option.note}</span>
                  </span>
                  <span className="mono text-xl font-bold">{option.pct}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel p-6.5">
            <p className="label">Positions this session</p>
            <div className="mt-4 flex gap-0.5">
              {SESSION_SIZES.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => onSessionSizeChange(option.value)}
                  className={`mono flex-1 py-4 text-sm font-bold ${sessionSize === option.value ? "bg-accent text-accent-ink" : "bg-line text-ink-muted hover:text-ink"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary py-7.5 text-base tracking-wider"
            onClick={onStart}
            disabled={decisionCount === 0}
          >
            Start session →
          </button>
        </div>
      </div>
    </section>
  );
}

function FigurineMoveList({ moves, viewIndex, onSelectPly }: { moves: MoveLedgerEntry[]; viewIndex: number; onSelectPly: (index: number) => void }) {
  const rows: Array<{ number: number; white?: { move: MoveLedgerEntry; index: number }; black?: { move: MoveLedgerEntry; index: number } }> = [];
  moves.forEach((move, index) => {
    const fenFields = move.fenBefore.split(" ");
    const number = Number(fenFields[5]) || 1;
    let row = rows.at(-1);
    if (!row || row.number !== number) {
      row = { number };
      rows.push(row);
    }
    if (fenFields[1] === "w") row.white = { move, index };
    else row.black = { move, index };
  });

  function Ply({ entry }: { entry?: { move: MoveLedgerEntry; index: number } }) {
    if (!entry) return <span className="ply is-empty">…</span>;
    const isCurrent = viewIndex === entry.index + 1;
    return (
      <button
        type="button"
        onClick={() => onSelectPly(entry.index + 1)}
        className={`ply ${isCurrent ? "is-current" : ""} ${entry.move.source === "engine" ? "!bg-accent !text-accent-ink" : ""}`}
        aria-label={`Go to ${entry.move.san}`}
      >
        {figurineSan(entry.move.san)}
      </button>
    );
  }

  return (
    <div className="min-h-56 flex-1 overflow-y-auto p-6.5">
      <p className="label">Moves</p>
      {rows.length === 0 ? (
        <p className="mt-9 text-center text-ink-muted">Make the first move on the board.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-0.5">
          {rows.map((row) => (
            <div key={row.number} className="grid grid-cols-[34px_1fr_1fr] items-center gap-2.5">
              <span className="mono text-[11px] text-ink-faint">{row.number}</span>
              <Ply entry={row.white} />
              <Ply entry={row.black} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EvalBar({ cp, evaluating }: { cp?: number | null; evaluating?: boolean }) {
  const clamped = typeof cp === "number" ? Math.max(-800, Math.min(800, cp)) : 0;
  const whitePercent = typeof cp === "number" ? 50 + (clamped / 800) * 50 : 50;
  return (
    <div className="relative hidden w-4 flex-none self-stretch overflow-hidden bg-surface-sunken sm:block" aria-hidden="true">
      <div
        className={`absolute inset-x-0 bottom-0 bg-ink-secondary transition-[height] duration-500 ${evaluating ? "animate-pulse" : ""}`}
        style={{ height: `${whitePercent}%` }}
      />
      <div className="absolute inset-x-0 top-1/2 h-[3px] bg-accent" />
    </div>
  );
}

/** The mockup's signature move: a full-width accent band that drops in for a state change. Quiet states get a plain status line instead. */
function TakeoverBand({ tag, headline, detail, right }: { tag: string; headline: string; detail: string; right?: string }) {
  return (
    <div className="animate-band-drop grid grid-cols-[auto_1fr_auto] items-center gap-7 bg-accent p-6 text-accent-ink">
      <span className="mono bg-canvas px-3 py-2 text-xs font-bold tracking-[0.16em] text-accent">{tag}</span>
      <div>
        <p className="text-[28px] leading-[1.05] font-bold tracking-tight text-balance">{headline}</p>
        <p className="mono mt-1.5 text-xs">{detail}</p>
      </div>
      {right && <span className="mono justify-self-end text-xs font-bold whitespace-nowrap">{right}</span>}
    </div>
  );
}

interface TrainingScreenProps {
  repertoire: Repertoire;
  session: TrainingSession;
  engineStatus: EngineStatus;
  onMove: (uci: string) => void;
  onRetry: () => void;
  onRevealAnswer: () => void;
  onPlayAnyway: () => void;
  onAddToRepertoire: () => void;
  onEndGame: () => void;
  onNextLine: () => void;
  onReview: () => void;
  onExit: () => void;
}

export function TrainingScreen({
  repertoire,
  session,
  engineStatus,
  onMove,
  onRetry,
  onRevealAnswer,
  onPlayAnyway,
  onAddToRepertoire,
  onEndGame,
  onNextLine,
  onReview,
  onExit,
}: TrainingScreenProps) {
  const { flipped: boardFlipped, toggle: onFlipBoard } = useBoardFlip();
  const currentLine = (session.drill?.currentLineIndex ?? 0) + 1;
  const lineCount = session.drill?.lines.length ?? 1;
  const acceptedMoves = activeEdges(repertoire.graph, session.positionKey).filter((edge) => edge.isAccepted);
  const isPlayersTurn = session.phase === "trainee_turn" || session.phase === "continuation";
  const lineDone = session.phase === "complete";
  const scoreReady = session.lineCompletionReason === "checkmate" || session.lineEvaluationCp !== undefined;

  const positions = useMemo(
    () => (session.moves.length ? [session.moves[0].fenBefore, ...session.moves.map((move) => move.fenAfter)] : [session.fen]),
    [session.moves, session.fen],
  );
  const [viewIndex, setViewIndex] = useState(positions.length - 1);
  // Auto-follow to the live position whenever a new move arrives (or a new line starts,
  // which always resets moves to []). Adjusting state directly during render — rather than
  // in an effect — is the documented React pattern for "reset local state when an input
  // changes"; it avoids an extra render pass and keeps this a pure derivation.
  const [trackedPositionsLength, setTrackedPositionsLength] = useState(positions.length);
  if (trackedPositionsLength !== positions.length) {
    setTrackedPositionsLength(positions.length);
    setViewIndex(positions.length - 1);
  }
  const atEnd = viewIndex === positions.length - 1;
  const atStart = viewIndex === 0;
  const viewFen = positions[viewIndex] ?? session.fen;
  const viewLastMove = viewIndex > 0 ? session.moves[viewIndex - 1]?.uci : undefined;

  const primaryAction = lineDone && scoreReady ? (currentLine < lineCount ? onNextLine : onReview) : undefined;
  useBoardKeys({
    onFlip: onFlipBoard,
    onPrimary: primaryAction,
    onPrev: atStart ? undefined : () => setViewIndex((index) => Math.max(0, index - 1)),
    onNext: atEnd ? undefined : () => setViewIndex((index) => Math.min(positions.length - 1, index + 1)),
    onStart: atStart ? undefined : () => setViewIndex(0),
    onEnd: atEnd ? undefined : () => setViewIndex(positions.length - 1),
  });

  const lastPly = session.moves.at(-1);

  return (
    <section className="min-h-screen bg-canvas">
      <header className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-6 px-4 sm:px-9">
        <div className="flex items-center gap-4">
          <span className="text-base font-semibold tracking-tight capitalize">{repertoire.name} — {repertoire.traineeColor}</span>
          <span className="mono text-[11px] text-ink-faint">Line {currentLine}/{lineCount}</span>
        </div>
        <div className="flex gap-0.5">
          {Array.from({ length: lineCount }, (_, index) => (
            <i key={index} className={`block h-2.5 w-6.5 ${index < currentLine - (lineDone ? 0 : 1) ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>
        <button type="button" className="mono justify-self-end text-[11px] text-ink-muted hover:text-ink" onClick={onExit}>Save &amp; exit</button>
      </header>

      {session.phase === "off_repertoire" ? (
        <TakeoverBand
          tag="Off book"
          headline={`That move isn't in your book.`}
          detail="Recall scoring stopped"
          right="Your move ▸"
        />
      ) : lineDone ? (
        <TakeoverBand
          tag={session.lineCompletionReason === "checkmate" ? "Checkmate" : "Line complete"}
          headline={session.lineCompletionReason === "book_complete" ? "End of line." : session.message ?? "Game complete."}
          detail={session.lineCompletionReason === "checkmate" ? "Game result" : engineStatus === "evaluating" ? "Evaluating…" : "Scored below"}
          right={currentLine < lineCount ? "Next line ▸" : "Review ▸"}
        />
      ) : session.takeoverReason ? (
        <TakeoverBand
          tag="Out of book"
          headline="Opponent left the book."
          detail={`Engine ≈${session.strength} · no move limit`}
          right={isPlayersTurn ? "Your move ▸" : "Opponent to move"}
        />
      ) : (
        <div className="flex h-11 items-center gap-2 px-4 sm:px-9">
          <span className={`h-2 w-2 flex-none bg-accent ${engineStatus === "thinking" ? "animate-pulse" : ""}`} aria-hidden="true" />
          <span className="mono text-xs text-ink-muted">
            {engineStatus === "thinking" ? "Opponent thinking…" : isPlayersTurn ? "Your move" : "Opponent to move"}
          </span>
        </div>
      )}

      <div className="mx-auto grid w-[min(1220px,calc(100%-36px))] grid-cols-1 gap-0.5 py-6 lg:grid-cols-[1fr_400px] lg:items-start">
        <div className="flex gap-0.5">
          <EvalBar cp={lineDone ? session.lineEvaluationCp : undefined} evaluating={engineStatus === "evaluating"} />
          <div className="min-w-0 flex-1">
            <Chessboard
              fen={viewFen}
              orientation={boardFlipped ? (repertoire.traineeColor === "white" ? "black" : "white") : repertoire.traineeColor}
              onMove={onMove}
              lastMove={viewLastMove}
              rejectedMove={session.phase === "off_repertoire" && atEnd ? session.pendingMove?.uci : undefined}
              interactive={isPlayersTurn && atEnd}
            />
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          <FigurineMoveList moves={session.moves} viewIndex={viewIndex} onSelectPly={setViewIndex} />

          {session.phase === "off_repertoire" && (
            <div className="panel p-6.5">
              <p className="label">Your book said</p>
              <div className="mt-3.5 flex flex-wrap gap-2">
                {acceptedMoves.length ? acceptedMoves.map((edge) => (
                  <span key={edge.id} className="mono bg-line px-4.5 py-3 text-base font-bold">{figurineSan(edge.san)}</span>
                )) : <span className="mono text-ink-faint">No saved answer</span>}
              </div>
              <p className="mono mt-3.5 text-[11px] leading-relaxed text-ink-muted">{lastPly?.san ? `${figurineSan(lastPly.san)} isn't a saved line.` : "Not a saved line."}</p>
            </div>
          )}

          {lineDone && (
            <div className="panel grid place-items-center gap-1 p-7 text-center">
              <p className="label">
                {session.lineCompletionReason === "checkmate" ? "Game result" : engineStatus === "evaluating" ? "Engine evaluation" : "Final evaluation"}
              </p>
              <p className="mt-2 text-5xl font-bold tracking-tighter">
                {session.lineCompletionReason === "checkmate"
                  ? "Checkmate"
                  : session.lineEvaluationCp === undefined
                    ? "…"
                    : session.lineEvaluationCp === null
                      ? "Unavailable"
                      : formatEvaluation(session.lineEvaluationCp)}
              </p>
            </div>
          )}

          <div className="mt-auto flex flex-col gap-0.5">
            {session.phase === "off_repertoire" && (
              <>
                <button type="button" className="btn btn-primary py-5" onClick={onRetry}>Retry</button>
                <div className="grid grid-cols-2 gap-0.5">
                  <button type="button" className="btn py-4" onClick={onRevealAnswer}>Show answer</button>
                  <button type="button" className="btn py-4" onClick={onPlayAnyway}>Play anyway</button>
                </div>
                <button type="button" className="btn py-4 text-accent" onClick={onAddToRepertoire}>+ Add this move</button>
              </>
            )}
            {session.takeoverReason && !lineDone && (
              <button type="button" className="btn py-4" onClick={onEndGame}>End game</button>
            )}
            {primaryAction && (
              <button type="button" className="btn btn-primary py-5" onClick={primaryAction}>
                {currentLine < lineCount ? "Next line" : "Review session"}
              </button>
            )}
            <MoveNavStrip
              atStart={atStart}
              atEnd={atEnd}
              onFirst={() => setViewIndex(0)}
              onPrev={() => setViewIndex((index) => Math.max(0, index - 1))}
              onNext={() => setViewIndex((index) => Math.min(positions.length - 1, index + 1))}
              onLast={() => setViewIndex(positions.length - 1)}
              onFlip={onFlipBoard}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
