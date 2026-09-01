"use client";

import { useState } from "react";
import { Chessboard } from "./chessboard";
import { EvalBar } from "./eval-bar";
import { RepertoireLine } from "./repertoire-line";
import { useBoardFlip } from "./use-board-flip";
import { useBoardKeys } from "./use-board-keys";
import { useLiveEvaluation } from "./use-live-evaluation";
import { activeEdges, restorableDeletedEdgeIds } from "@/lib/chess/graph";
import { importPgn, PgnImportError } from "@/lib/chess/pgn";
import { exportPgn } from "@/lib/chess/pgn-export";
import { fenTurn } from "@/lib/chess/position-key";
import type { ImportPreview, PositionGraph, Repertoire, TraineeColor } from "@/lib/chess/types";

interface RepertoireEditorProps {
  repertoire: Repertoire;
  positionId: string;
  history: string[];
  onBack: () => void;
  onNameChange: (name: string) => void;
  onColorChange: (color: TraineeColor) => void;
  onMove: (uci: string) => void;
  onNavigate: (positionId: string, history: string[]) => void;
  onRemoveMove: (edgeId: string) => void;
  onSetMainline: (edgeId: string) => void;
  onImport: (graph: PositionGraph, restoreDeletedIds: Set<string>) => void;
}

function downloadPgn(repertoire: Repertoire) {
  const pgn = exportPgn(repertoire.graph, { headers: { Event: repertoire.name } });
  const blob = new Blob([pgn], { type: "application/x-chess-pgn" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${repertoire.name.replace(/[^a-z0-9-]+/gi, "_") || "repertoire"}.pgn`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Keyed by repertoire id + name in the parent, so React remounts (and resets local state) whenever either changes externally — no effect needed. */
function NameField({ initial, onSave }: { initial: string; onSave: (name: string) => void }) {
  const [name, setName] = useState(initial);
  function save() {
    const next = name.trim() || "Untitled repertoire";
    setName(next);
    if (next !== initial) onSave(next);
  }
  return (
    <input
      value={name}
      onChange={(event) => setName(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      aria-label="Repertoire name"
      className="w-[min(440px,100%)] justify-self-center border-b-2 border-transparent bg-transparent px-3.5 py-1 text-center text-[17px] font-semibold hover:border-line focus:border-line focus:outline-none"
    />
  );
}

export function RepertoireEditor({
  repertoire,
  positionId,
  history,
  onBack,
  onNameChange,
  onColorChange,
  onMove,
  onNavigate,
  onRemoveMove,
  onSetMainline,
  onImport,
}: RepertoireEditorProps) {
  const [tab, setTab] = useState<"moves" | "import">("moves");
  const [pgn, setPgn] = useState("");
  const [preview, setPreview] = useState<ImportPreview>();
  const [restoreDeleted, setRestoreDeleted] = useState(false);
  const [error, setError] = useState<string>();
  const { flipped: boardFlipped, toggle: toggleFlip } = useBoardFlip();
  const position = repertoire.graph.positions[positionId];
  const evaluation = useLiveEvaluation(position.fen);

  function previewImport() {
    try {
      setPreview(importPgn(pgn, repertoire.traineeColor, { targetGraph: repertoire.graph }));
      setRestoreDeleted(false);
      setError(undefined);
    } catch (reason) {
      setPreview(undefined);
      setError(reason instanceof PgnImportError ? reason.message : "This PGN could not be read.");
    }
  }

  function commitImport() {
    if (!preview) return;
    const restoreIds = restoreDeleted ? new Set(restorableDeletedEdgeIds(repertoire.graph, preview.graph)) : new Set<string>();
    onImport(preview.graph, restoreIds);
    setPgn("");
    setPreview(undefined);
    setTab("moves");
  }

  const branchOptions = activeEdges(repertoire.graph, positionId);
  const previous = history.at(-1);

  useBoardKeys({
    onFlip: toggleFlip,
    onPrev: previous ? () => onNavigate(previous, history.slice(0, -1)) : undefined,
    onNext: branchOptions.length >= 1 ? () => onNavigate(branchOptions[0].to, [...history, positionId]) : undefined,
    onStart: history.length ? () => onNavigate(repertoire.graph.roots[0], []) : undefined,
    onSelectOption: branchOptions.length > 1
      ? (index) => {
          const option = branchOptions[index];
          if (option) onNavigate(option.to, [...history, positionId]);
        }
      : undefined,
  });

  return (
    <section className="min-h-screen bg-canvas">
      <header className="grid h-16 grid-cols-[160px_1fr_160px] items-center gap-5 px-4 sm:px-9">
        <button type="button" className="mono justify-self-start text-xs text-ink-muted hover:text-ink" onClick={onBack}>← Repertoires</button>
        <NameField key={`${repertoire.id}:${repertoire.name}`} initial={repertoire.name} onSave={onNameChange} />
        <span className="mono justify-self-end text-[11px] text-ink-faint">Saved automatically</span>
      </header>
      <div className="mx-auto grid w-[min(1220px,calc(100%-36px))] grid-cols-1 gap-0.5 py-6 lg:grid-cols-[1fr_420px] lg:items-start">
        <div className="mx-auto w-full max-w-[600px]">
          <div className="flex items-baseline justify-between gap-5 pb-4">
            <div>
              <p className="eyebrow">Editing · ply {history.length.toString().padStart(2, "0")}</p>
              <h1 className="mt-2 text-4xl font-bold tracking-tighter capitalize">{fenTurn(position.fen)} to move</h1>
            </div>
            <p className="mono max-w-[26ch] text-right text-xs leading-relaxed text-ink-muted">Move a piece to add a line.</p>
          </div>
          <div className="flex gap-0.5">
            <EvalBar cp={evaluation.cp} evaluating={evaluation.status === "evaluating"} />
            <div className="min-w-0 flex-1 panel p-3.5">
              <Chessboard
                fen={position.fen}
                orientation={boardFlipped ? (repertoire.traineeColor === "white" ? "black" : "white") : repertoire.traineeColor}
                onMove={onMove}
              />
            </div>
          </div>
          <div className="mt-0.5 grid grid-cols-4 gap-0.5">
            <button
              type="button"
              disabled={!history.length}
              className="btn justify-start px-4.5 py-4 disabled:opacity-30"
              onClick={() => { const prev = history.at(-1); if (prev) onNavigate(prev, history.slice(0, -1)); }}
            >
              ← Previous
            </button>
            <button type="button" className="btn justify-start px-4.5 py-4" onClick={() => onNavigate(repertoire.graph.roots[0], [])}>Start position</button>
            <button type="button" className="btn justify-start px-4.5 py-4" onClick={toggleFlip}>Flip ⇅</button>
            <button type="button" className="btn justify-start px-4.5 py-4" onClick={() => downloadPgn(repertoire)}>Export PGN</button>
          </div>
        </div>

        <aside className="flex flex-col gap-0.5">
          <div className="panel flex items-center justify-between gap-4 p-5">
            <p className="label">Book side</p>
            <div className="flex gap-0.5">
              {(["white", "black"] as const).map((color) => (
                <button
                  type="button"
                  key={color}
                  onClick={() => onColorChange(color)}
                  className={`mono min-w-20 px-5 py-2.5 text-xs font-bold uppercase ${repertoire.traineeColor === color ? "bg-accent text-accent-ink" : "bg-line text-ink-muted"}`}
                >
                  {color}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-0.5" role="tablist" aria-label="Editor tools">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "moves"}
              onClick={() => setTab("moves")}
              className={`mono flex-1 py-4 text-xs font-bold uppercase ${tab === "moves" ? "bg-accent text-accent-ink" : "bg-surface-sunken text-ink-muted hover:text-ink"}`}
            >
              Moves
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "import"}
              onClick={() => setTab("import")}
              className={`mono flex-1 py-4 text-xs font-bold uppercase ${tab === "import" ? "bg-accent text-accent-ink" : "bg-surface-sunken text-ink-muted hover:text-ink"}`}
            >
              Import PGN
            </button>
          </div>

          {tab === "moves" ? (
            <RepertoireLine graph={repertoire.graph} currentId={position.id} history={history} onNavigate={onNavigate} onRemove={onRemoveMove} onSetMainline={onSetMainline} />
          ) : (
            <div className="panel p-6.5">
              <p className="label">Paste PGN</p>
              <label className="mt-4 grid gap-1.5">
                <span className="sr-only">PGN text</span>
                <div className="relative">
                  <textarea
                    value={pgn}
                    onChange={(event) => { setPgn(event.target.value); setPreview(undefined); }}
                    placeholder="1. e4 e5 2. Nf3 Nc6 3. Bc4 …"
                    spellCheck={false}
                    className="mono min-h-30 w-full resize-y border-0 bg-canvas p-4.5 text-xs leading-relaxed text-ink placeholder:text-ink-dim"
                  />
                  {!pgn && <i className="animate-cursor-blink pointer-events-none absolute top-[19px] left-[187px] hidden h-3.5 w-2 bg-accent sm:block" aria-hidden="true" />}
                </div>
              </label>
              <label className="mono mt-3.5 block bg-canvas p-3.5 text-xs text-ink-muted">
                Choose a PGN file
                <input type="file" accept=".pgn,text/plain" className="mt-1.5 block w-full text-xs" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((text) => { setPgn(text); setPreview(undefined); }); }} />
              </label>
              {error && <p role="alert" className="mt-3.5 bg-danger-weak p-3.5 text-danger">{error}</p>}
              {preview ? (
                <div className="mt-3.5 grid gap-2 bg-accent p-4.5 text-accent-ink">
                  <strong>{preview.moveCount} moves in {preview.gameCount} game{preview.gameCount === 1 ? "" : "s"}</strong>
                  <span className="mono text-xs">{preview.positionCount} positions · {preview.branchCount} branches · {preview.transpositionCount} transpositions</span>
                  {preview.warnings.map((warning) => <small key={warning} className="mono text-xs">{warning}</small>)}
                  {preview.restoredMoveCount > 0 && (
                    <label className="mono flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={restoreDeleted} onChange={(event) => setRestoreDeleted(event.target.checked)} />
                      Restore {preview.restoredMoveCount} previously deleted move{preview.restoredMoveCount === 1 ? "" : "s"} found in this PGN
                    </label>
                  )}
                  <button type="button" className="btn mt-1.5 bg-canvas text-accent" onClick={commitImport}>Add to repertoire</button>
                </div>
              ) : (
                <button type="button" className="btn btn-primary mt-4 w-full py-4.5" disabled={!pgn.trim()} onClick={previewImport}>Preview import</button>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
