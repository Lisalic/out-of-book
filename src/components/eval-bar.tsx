"use client";

import { formatEvaluation } from "@/lib/chess/evaluation";

export function EvalBar({ cp, evaluating }: { cp?: number | null; evaluating?: boolean }) {
  const clamped = typeof cp === "number" ? Math.max(-800, Math.min(800, cp)) : 0;
  const whitePercent = typeof cp === "number" ? 50 + (clamped / 800) * 50 : 50;
  const label = typeof cp === "number" ? formatEvaluation(cp) : undefined;
  return (
    <div className="group relative hidden w-4 flex-none self-stretch sm:block">
      <div className="absolute inset-0 overflow-hidden bg-surface-sunken" aria-hidden="true">
        <div
          className={`absolute inset-x-0 bottom-0 bg-ink-secondary transition-[height] duration-500 ${evaluating ? "animate-pulse" : ""}`}
          style={{ height: `${whitePercent}%` }}
        />
        <div className="absolute inset-x-0 top-1/2 h-[3px] bg-accent" />
      </div>
      {label && (
        <span className="mono pointer-events-none absolute top-1/2 left-full z-20 ml-1.5 -translate-y-1/2 rounded bg-canvas px-2 py-1 text-xs font-bold whitespace-nowrap text-ink opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
          {label}
        </span>
      )}
    </div>
  );
}
