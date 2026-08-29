"use client";

interface MoveNavStripProps {
  atStart: boolean;
  atEnd: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  onFlip?: () => void;
}

/** The ⏮ ◀ ▶ ⏭ move-list scrubber every chess site has, plus an optional board-flip button. */
export function MoveNavStrip({ atStart, atEnd, onFirst, onPrev, onNext, onLast, onFlip }: MoveNavStripProps) {
  return (
    <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${onFlip ? 5 : 4}, 1fr)` }} role="group" aria-label="Move navigation">
      <button type="button" className="btn py-3.5 text-base disabled:opacity-25" disabled={atStart} onClick={onFirst} aria-label="Go to start">⏮</button>
      <button type="button" className="btn py-3.5 text-base disabled:opacity-25" disabled={atStart} onClick={onPrev} aria-label="Previous move">◀</button>
      <button type="button" className="btn py-3.5 text-base disabled:opacity-25" disabled={atEnd} onClick={onNext} aria-label="Next move">▶</button>
      <button type="button" className="btn py-3.5 text-base disabled:opacity-25" disabled={atEnd} onClick={onLast} aria-label="Go to latest move">⏭</button>
      {onFlip && (
        <button type="button" className="btn py-3.5 text-base" onClick={onFlip} aria-label="Flip board">⇅</button>
      )}
    </div>
  );
}
