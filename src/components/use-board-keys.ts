"use client";

import { useEffect } from "react";

export interface BoardKeyActions {
  onPrev?: () => void;
  onNext?: () => void;
  onStart?: () => void;
  onEnd?: () => void;
  onFlip?: () => void;
  /** Space — the screen's current primary action (e.g. Show answer, Next line). */
  onPrimary?: () => void;
  /** Digit keys 1-9 — pick a numbered option (e.g. a branch variation), zero-indexed. */
  onSelectOption?: (index: number) => void;
  enabled?: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Lichess-style board keyboard bindings: ←/→ step, ↑/↓ start/end, f flip, space for the primary action, 1-9 to pick an option. */
export function useBoardKeys(actions: BoardKeyActions): void {
  const { onPrev, onNext, onStart, onEnd, onFlip, onPrimary, onSelectOption, enabled = true } = actions;

  useEffect(() => {
    if (!enabled) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key) {
        case "ArrowLeft":
          if (!onPrev) return;
          event.preventDefault();
          onPrev();
          return;
        case "ArrowRight":
          if (!onNext) return;
          event.preventDefault();
          onNext();
          return;
        case "ArrowUp":
          if (!onStart) return;
          event.preventDefault();
          onStart();
          return;
        case "ArrowDown":
          if (!onEnd) return;
          event.preventDefault();
          onEnd();
          return;
        case "f":
        case "F":
          if (!onFlip) return;
          event.preventDefault();
          onFlip();
          return;
        case " ":
          if (!onPrimary) return;
          event.preventDefault();
          onPrimary();
          return;
        default:
          if (onSelectOption && /^[1-9]$/.test(event.key)) {
            event.preventDefault();
            onSelectOption(Number(event.key) - 1);
          }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onPrev, onNext, onStart, onEnd, onFlip, onPrimary, onSelectOption]);
}
