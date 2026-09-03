"use client";

import { activeEdges } from "@/lib/chess/graph";
import { groupMoveRows, type MoveRow } from "@/lib/chess/move-rows";
import { figurineSan } from "@/lib/chess/notation";
import type { MoveEdge, PositionGraph } from "@/lib/chess/types";

interface LineEntry {
  edge: MoveEdge;
  historyAfter: string[];
  isCurrent: boolean;
}

interface RepertoireLineProps {
  graph: PositionGraph;
  currentId: string;
  history: string[];
  onNavigate: (positionId: string, history: string[]) => void;
  onRemove: (edgeId: string) => void;
  onSetMainline: (edgeId: string) => void;
}

/** The move that was played to reach the position on the board, if any. */
function incomingEdge(graph: PositionGraph, currentId: string, history: string[]): MoveEdge | undefined {
  const previous = history.at(-1);
  if (!previous) return undefined;
  return activeEdges(graph, previous).find((edge) => edge.to === currentId);
}

function RemoveCurrentButton({
  edge,
  history,
  onRemove,
  onNavigate,
}: {
  edge: MoveEdge;
  history: string[];
  onRemove: (edgeId: string) => void;
  onNavigate: (positionId: string, history: string[]) => void;
}) {
  return (
    <button
      type="button"
      className="btn btn-danger mt-3.5 w-full"
      onClick={() => {
        onRemove(edge.id);
        onNavigate(edge.from, history.slice(0, -1));
      }}
    >
      Remove {edge.san}
    </button>
  );
}

/**
 * The box has exactly one mode, always agreeing with the board: a fork on the board replaces the
 * move list outright with a numbered picker, and the move list never extends past a fork.
 */
export function RepertoireLine({
  graph,
  currentId,
  history,
  onNavigate,
  onRemove,
  onSetMainline,
}: RepertoireLineProps) {
  const options = activeEdges(graph, currentId);
  const arrivedBy = incomingEdge(graph, currentId, history);

  if (options.length > 1) {
    return (
      <div className="panel p-6.5">
        <div className="flex items-baseline justify-between">
          <p className="label">Choose continuation</p>
          <p className="mono text-[11px] text-accent">{options.length} variations</p>
        </div>

        <div className="mt-4 flex flex-col gap-0.5" aria-label="Repertoire branch options">
          {options.map((edge, index) => (
            <div key={edge.id} className="mono grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3.5 bg-surface p-3">
              <span className="min-w-6 bg-line px-2 py-1 text-center text-[11px] font-bold text-ink-muted">{index + 1}</span>
              <button
                type="button"
                className="min-w-13 border-0 bg-transparent p-0 text-left text-lg font-bold"
                aria-label={`Continue with ${edge.san}`}
                aria-keyshortcuts={String(index + 1)}
                onClick={() => onNavigate(edge.to, [...history, currentId])}
              >
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

        <p className="mono mt-3.5 text-[11px] text-ink-faint">
          Press 1–{options.length}, or → for the mainline.
        </p>

        {arrivedBy && <RemoveCurrentButton edge={arrivedBy} history={history} onRemove={onRemove} onNavigate={onNavigate} />}
      </div>
    );
  }

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

  const branchAhead = activeEdges(graph, branchPosition);
  const rows: Array<MoveRow<LineEntry>> = groupMoveRows(entries, (entry) => graph.positions[entry.edge.from].fen);

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

      {rows.length > 0 && (
        <div className="mt-4 flex flex-col gap-0.5" aria-label="Repertoire move list">
          {rows.map((row, index) => (
            <div className="grid grid-cols-[34px_1fr_1fr] items-center gap-2.5" key={`${row.number}-${index}`}>
              <span className="mono text-[11px] text-ink-faint">{row.number}</span>
              {renderPly(row.white, "white")}
              {renderPly(row.black, "black")}
            </div>
          ))}
        </div>
      )}

      {selectedEntry && (selectedEntry.edge.comments.length > 0 || selectedEntry.edge.nags.length > 0) && (
        <div className="mt-3.5 bg-surface p-3.5">
          {selectedEntry.edge.comments.map((comment) => <p key={comment} className="text-ink-secondary">{comment}</p>)}
          {selectedEntry.edge.nags.length > 0 && (
            <p className="mono mt-1.5 text-[11px] text-ink-faint">{selectedEntry.edge.nags.map((nag) => `$${nag}`).join(" ")}</p>
          )}
        </div>
      )}

      {branchAhead.length > 1 ? (
        <button
          type="button"
          className="mono mt-6 w-full bg-surface p-4.5 text-[11px] text-ink-muted hover:text-ink"
          onClick={() => onNavigate(branchPosition, branchHistory)}
        >
          Branch ahead · {branchAhead.length} continuations
        </button>
      ) : branchAhead.length === 0 ? (
        <div className="mt-6 bg-surface p-4.5 text-center">
          <p className="label">End of saved line</p>
        </div>
      ) : null}

      {selectedEntry && <RemoveCurrentButton edge={selectedEntry.edge} history={history} onRemove={onRemove} onNavigate={onNavigate} />}
    </div>
  );
}
