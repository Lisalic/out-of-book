"use client";

import { useState } from "react";
import { formatEvaluation } from "@/lib/chess/evaluation";
import type { ReviewState, TrainingSession } from "@/lib/chess/types";

interface ReviewScreenProps {
  session: TrainingSession;
  reviewStates: ReviewState[];
  onDone: () => void;
  onAgain: () => void;
}

function formatDue(due: string, now = Date.now()): string {
  const days = Math.round((Date.parse(due) - now) / 86_400_000);
  if (days <= 0) return "Due now";
  if (days === 1) return "Tomorrow";
  if (days < 30) return `In ${days} days`;
  const months = Math.round(days / 30);
  return `In ${months} month${months === 1 ? "" : "s"}`;
}

export function ReviewScreen({ session, reviewStates, onDone, onAgain }: ReviewScreenProps) {
  const results = session.drill?.completedLines ?? [];
  const attempts = results.length ? results.flatMap((line) => line.attempts) : session.attempts;
  const firstTry = attempts.filter((attempt) => attempt.result === "first_try").length;
  const retries = attempts.filter((attempt) => attempt.result === "retry").length;
  const revealed = attempts.filter((attempt) => attempt.result === "revealed").length;
  const recallRate = attempts.length ? Math.round((firstTry / attempts.length) * 100) : 100;
  const evaluated = results.filter((line) => typeof line.evaluationCp === "number");
  const meanEval = evaluated.length
    ? Math.round(evaluated.reduce((sum, line) => sum + (line.evaluationCp ?? 0), 0) / evaluated.length)
    : null;
  const [now] = useState(() => Date.now());

  const dueFor = (positionKey: string) =>
    reviewStates.find((state) => state.repertoireId === session.repertoireId && state.positionKey === positionKey);

  return (
    <section className="mx-auto w-[min(1180px,calc(100%-56px))] flex-1 py-11">
      <p className="eyebrow">Session closed · {results.length || 1} positions</p>
      <h1 className="mt-4.5 text-[64px] leading-[0.9] font-bold tracking-tighter text-balance sm:text-[88px]">
        {firstTry.toString().toUpperCase()} OF {attempts.length}, FIRST TRY.
      </h1>

      <div className="mt-9 grid grid-cols-1 gap-0.5 lg:grid-cols-2">
        <div className="bg-accent p-7.5 text-accent-ink">
          <p className="mono text-xs font-bold tracking-[0.16em] uppercase">Axis 1 · repertoire recall</p>
          <p className="mt-3 text-8xl leading-[0.85] font-bold tracking-tighter">
            {recallRate}<span className="text-4xl">%</span>
          </p>
          <div className="mt-5.5 flex gap-0.5">
            {attempts.map((attempt, index) => (
              <i key={index} className={`block h-6.5 flex-1 ${attempt.result === "first_try" ? "bg-canvas" : "bg-canvas/30"}`} />
            ))}
          </div>
          <p className="mono mt-4.5 text-xs leading-relaxed">{firstTry} first try · {retries} corrected · {revealed} revealed</p>
        </div>
        <div className="panel p-7.5">
          <p className="label">Axis 2 · chess quality after takeover</p>
          <p className="mt-3 text-8xl leading-[0.85] font-bold tracking-tighter">{meanEval === null ? "—" : formatEvaluation(meanEval)}</p>
          <div className="mt-5.5 flex h-13 items-end gap-0.5">
            {evaluated.length === 0 ? (
              <p className="self-center text-ink-faint">No sparring lines to score yet.</p>
            ) : evaluated.map((line, index) => {
              const cp = line.evaluationCp ?? 0;
              const height = Math.max(8, Math.min(100, 50 + cp / 16));
              return <i key={index} className={`flex-1 ${cp >= 0 ? "bg-accent" : "bg-ink-dim"}`} style={{ height: `${height}%` }} />;
            })}
          </div>
          <p className="mono mt-4.5 text-xs leading-relaxed text-ink-muted">Mean evaluation across sparring lines.</p>
        </div>
      </div>

      <section className="mt-6">
        <div className="mono grid grid-cols-[48px_1.5fr_1fr_90px_90px_130px] gap-4 px-1 pb-3 text-[10px] font-bold tracking-wide text-ink-faint uppercase">
          <span>#</span><span>Position</span><span>Finish</span><span>Plies</span><span>Score</span><span>Next review</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {results.map((line) => {
            const due = dueFor(line.targetPositionKey);
            return (
              <div className="panel grid grid-cols-[48px_1.5fr_1fr_90px_90px_130px] items-center gap-4 p-4.5" key={line.lineIndex}>
                <span className="mono text-xs text-ink-faint">{String(line.lineIndex + 1).padStart(2, "0")}</span>
                <span className="text-lg font-semibold tracking-tight">Position {line.lineIndex + 1}</span>
                <span className={`mono text-[11px] tracking-wide uppercase ${line.leftBook ? "text-accent" : "text-ink-muted"}`}>
                  {line.completionReason === "checkmate" ? "Checkmate" : line.leftBook ? "Sparred" : "In book"}
                </span>
                <span className="mono text-xs text-ink-muted">{line.moves.length}</span>
                <span className="mono text-lg font-bold">{line.completionReason === "checkmate" ? "—" : typeof line.evaluationCp === "number" ? formatEvaluation(line.evaluationCp) : "Unavailable"}</span>
                <span className="mono text-xs text-ink-faint">{due ? formatDue(due.due, now) : "—"}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-0.5 flex gap-0.5">
          <button type="button" className="btn flex-1 py-5.5" onClick={onDone}>Back to today</button>
          <button type="button" className="btn btn-primary flex-1 py-5.5" onClick={onAgain}>Practise again</button>
        </div>
      </section>
    </section>
  );
}
