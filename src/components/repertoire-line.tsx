"use client";

import { activeEdges } from "@/lib/chess/graph";
import { figurineSan } from "@/lib/chess/notation";
import type { MoveEdge, PositionGraph } from "@/lib/chess/types";

interface LineEntry {
  edge: MoveEdge;
  historyAfter: string[];
  isCurrent: boolean;
}

interface MoveRow {
  number: number;
  white?: LineEntry;
  black?: LineEntry;
}

interface RepertoireLineProps {
  graph: PositionGraph;
  currentId: string;
  history: string[];
  onNavigate: (positionId: string, history: string[]) => void;
  onRemove: (edgeId: string) => void;
  onSetMainline: (edgeId: string) => void;
}

export function RepertoireLine({
  graph,
  currentId,
  history,
  onNavigate,
  onRemove,
  onSetMainline,
}: RepertoireLineProps) {
  const entries: LineEntry[] = [];
  const pathPositions = [...history, currentId];

  for (let index = 0; index < history.length; index += 1) {
    const from = history[index];
    const to = pathPositions[index + 1];
    const edge = activeEdges(graph, from).find((candidate) => candidate.to === to);
    if (!edge) break;
    entries.push({
      edge,
      historyAfter: history.slice(0, index + 1),
      isCurrent: index === history.length - 1,
    });
  }

  let branchPosition = currentId;
  let branchHistory = [...history];
  const visited = new Set(pathPositions);
  while (true) {
    const outgoing = activeEdges(graph, branchPosition);
    if (outgoing.length !== 1) break;
    const edge = outgoing[0];
    const historyAfter = [...branchHistory, branchPosition];
    entries.push({ edge, historyAfter, isCurrent: false });
    branchHistory = historyAfter;
    branchPosition = edge.to;
    if (visited.has(branchPosition)) break;
    visited.add(branchPosition);
  }

  const branchOptions = activeEdges(graph, branchPosition);
  const rows: MoveRow[] = [];
  entries.forEach((entry) => {
    const fenFields = graph.positions[entry.edge.from].fen.split(" ");
    const number = Number(fenFields[5]) || 1;
    let row = rows.at(-1);
    if (!row || row.number !== number) {
      row = { number };
      rows.push(row);
    }
    if (fenFields[1] === "w") row.white = entry;
    else row.black = entry;
  });

  const selectedEntry = entries.find((entry) => entry.isCurrent);

  function renderPly(entry: LineEntry | undefined, color: "white" | "black") {
    if (!entry) return <span className="ply is-empty">{color === "white" ? "" : "…"}</span>;
    return (
      <button
        type="button"
        className={`ply ${entry.isCurrent ? "is-current" : ""}`}
        onClick={() => onNavigate(entry.edge.to, entry.historyAfter)}
        aria-label={`Go to ${entry.edge.san}`}
      >
        {figurineSan(entry.edge.san)}
      </button>
    );
  }

  return (
    <div className="panel p-6.5">
      <div className="flex items-baseline justify-between">
        <p className="label">Current line</p>
        <p className="mono text-[11px] text-ink-faint">{entries.length} plies</p>
      </div>

      {rows.length ? (
        <div className="mt-4 flex flex-col gap-0.5" aria-label="Repertoire move list">
          {rows.map((row, index) => (
            <div className="grid grid-cols-[34px_1fr_1fr] items-center gap-2.5" key={`${row.number}-${index}`}>
              <span className="mono text-[11px] text-ink-faint">{row.number}</span>
              {renderPly(row.white, "white")}
              {renderPly(row.black, "black")}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-ink-muted">The line starts from this position.</p>
      )}

      {selectedEntry && (selectedEntry.edge.comments.length > 0 || selectedEntry.edge.nags.length > 0) && (
        <div className="mt-3.5 bg-surface p-3.5">
          {selectedEntry.edge.comments.map((comment) => <p key={comment} className="text-ink-secondary">{comment}</p>)}
          {selectedEntry.edge.nags.length > 0 && (
            <p className="mono mt-1.5 text-[11px] text-ink-faint">{selectedEntry.edge.nags.map((nag) => `$${nag}`).join(" ")}</p>
          )}
        </div>
      )}

      {branchOptions.length > 1 ? (
        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <p className="label">Branch reached</p>
            <p className="mono text-[11px] text-accent">{branchOptions.length} replies saved</p>
          </div>
          <div className="mt-3.5 flex flex-col gap-0.5">
            {branchOptions.map((edge) => (
              <div key={edge.id} className="mono grid grid-cols-[auto_1fr_auto_auto] items-center gap-3.5 bg-surface p-3">
                <button type="button" className="min-w-13 border-0 bg-transparent p-0 text-left text-lg font-bold" onClick={() => onNavigate(edge.to, [...branchHistory, branchPosition])}>
                  {figurineSan(edge.san)}
                </button>
                <span className="text-[11px] text-ink-muted">{edge.isAccepted ? "Your answer" : "Opponent line"}</span>
                {edge.isMainline ? (
                  <span className="bg-accent px-2.5 py-1.5 text-[10px] font-bold tracking-wide text-accent-ink uppercase">Mainline</span>
                ) : (
                  <button type="button" className="bg-line px-2.5 py-1.5 text-[10px] font-bold tracking-wide text-ink-muted uppercase hover:text-ink" onClick={() => onSetMainline(edge.id)}>
                    Set main
                  </button>
                )}
                <button type="button" className="text-sm text-ink-muted hover:text-danger" aria-label={`Remove ${edge.san}`} onClick={() => onRemove(edge.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : branchOptions.length === 0 ? (
        <div className="mt-6 bg-surface p-4.5 text-center">
          <p className="label">End of saved line</p>
          <p className="mt-1.5 text-sm text-ink-muted">Move a piece to continue.</p>
        </div>
      ) : null}

      {selectedEntry && (
        <button
          type="button"
          className="btn btn-danger mt-3.5 w-full"
          onClick={() => {
            onRemove(selectedEntry.edge.id);
            onNavigate(selectedEntry.edge.from, history.slice(0, -1));
          }}
        >
          Remove {selectedEntry.edge.san}
        </button>
      )}
    </div>
  );
}
