"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { OPENING_PRESETS, type OpeningPreset } from "@/lib/chess/opening-presets";
import type { Repertoire, TraineeColor } from "@/lib/chess/types";

interface OpeningPickerProps {
  repertoires: Repertoire[];
  side: TraineeColor;
  onSideChange: (side: TraineeColor) => void;
  onSelect: (preset: OpeningPreset) => void | Promise<void>;
}

export function OpeningPicker({ repertoires, side, onSideChange, onSelect }: OpeningPickerProps) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = "opening-picker-panel";
  const query = search.trim().toLowerCase();
  const matches = useMemo(() => OPENING_PRESETS.filter((preset) => (
    !query || [preset.name, preset.description, ...preset.aliases, ...preset.moves]
      .join(" ")
      .toLowerCase()
      .includes(query)
  )), [query]);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    function closeOnOutsidePointerDown(event: PointerEvent) {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative w-full sm:w-auto">
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-primary w-full px-6.5 py-5 sm:w-auto"
        aria-expanded={open}
        aria-controls={panelId}
        aria-busy={selecting}
        disabled={selecting}
        onClick={() => setOpen((current) => !current)}
      >
        Openings
        <svg
          aria-hidden="true"
          viewBox="0 0 12 8"
          className={`opening-picker-chevron h-2 w-3 ${open ? "is-open" : ""}`}
        >
          <path d="M1 1.5 6 6.5l5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        {selecting && <span className="h-2 w-2 animate-pulse bg-accent-ink" aria-hidden="true" />}
      </button>

      {open && (
        <div
          id={panelId}
          className="mt-0.5 w-full bg-canvas sm:absolute sm:top-full sm:right-0 sm:z-20 sm:w-[min(760px,calc(100vw-56px))]"
        >
          <div className="panel grid gap-0.5 p-0.5 sm:grid-cols-[auto_1fr]">
            <div className="flex gap-0.5" role="group" aria-label="Practice side">
              {(["white", "black"] as const).map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-pressed={side === color}
                  onClick={() => onSideChange(color)}
                  className={`mono min-h-11 flex-1 px-5 py-3 text-xs font-bold uppercase sm:flex-none ${side === color ? "bg-accent text-accent-ink" : "bg-line text-ink-secondary hover:text-ink"}`}
                >
                  {color === "white" ? "White" : "Black"}
                </button>
              ))}
            </div>
            <label className="min-w-0">
              <span className="sr-only">Search openings</span>
              <input
                type="search"
                name="opening-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or moves…"
                autoComplete="off"
                className="h-11 w-full border-0 bg-surface px-4 text-base text-ink placeholder:text-ink-dim"
              />
            </label>
          </div>

          <p aria-live="polite" className="mono bg-surface-sunken px-4 py-3 text-[11px] text-ink-muted">
            {matches.length} opening{matches.length === 1 ? "" : "s"}
          </p>

          {matches.length ? (
            <div className="opening-picker-results flex max-h-[min(520px,60vh)] flex-col gap-0.5 overflow-y-auto overscroll-contain">
              {matches.map((preset) => {
                const saved = repertoires.some((item) => item.sourcePresetId === preset.id && item.traineeColor === side);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={async () => {
                      setOpen(false);
                      triggerRef.current?.focus();
                      setSelecting(true);
                      try {
                        await onSelect(preset);
                      } finally {
                        setSelecting(false);
                      }
                    }}
                    className="group grid min-h-24 w-full grid-cols-1 gap-2 bg-surface p-4 text-left hover:bg-surface-sunken sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="text-lg tracking-tight text-ink group-hover:text-accent">{preset.name}</strong>
                        {saved && <span className="mono bg-accent px-2 py-1 text-[9px] font-bold uppercase text-accent-ink">In your books</span>}
                      </span>
                      <span className="mt-1 block text-sm text-ink-muted text-pretty">{preset.description}</span>
                    </span>
                    <span className="mono min-w-0 text-xs text-ink-muted sm:max-w-72 sm:text-right">
                      <span className="sm:hidden">{preset.moves.slice(0, 4).join(" ")} …</span>
                      <span className="hidden sm:inline">{preset.moves.join(" ")}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="panel p-6 text-ink-muted">No openings match “{search.trim()}”.</p>
          )}
        </div>
      )}
    </div>
  );
}
