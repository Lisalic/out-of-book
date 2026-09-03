"use client";

export function BestMoveButton({ onClick, disabled, thinking, className = "btn" }: {
  onClick: () => void;
  disabled: boolean;
  thinking: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`${className} disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
      onClick={onClick}
      disabled={disabled}
      aria-label="Play best move"
      aria-busy={thinking}
      title={thinking ? "Finding best move…" : "Play best move"}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true" className={thinking ? "animate-pulse" : undefined}>
        <path fillRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z M12 5.5l1.91 3.87 4.27.62-3.09 3.01.73 4.25L12 15.24l-3.82 2.01.73-4.25-3.09-3.01 4.27-.62L12 5.5Z" />
      </svg>
      <span className="sr-only" role="status">{thinking ? "Finding best move…" : ""}</span>
    </button>
  );
}
