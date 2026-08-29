import { activeEdges } from "./graph";
import { positionKey, fenTurn } from "./position-key";
import { START_FEN } from "./rules";
import type { MoveEdge, PositionGraph } from "./types";

function escapeHeader(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function glyphs(edge: MoveEdge): string {
  let suffix = "";
  edge.comments.forEach((comment) => { suffix += ` {${comment}}`; });
  edge.nags.forEach((nag) => { suffix += ` $${nag}`; });
  return suffix;
}

/** Renders the move tree from one position, in Standard Algebraic Notation with `(...)` sidelines. */
function renderFrom(graph: PositionGraph, positionId: string, forceNumberForBlack: boolean): string {
  const edges = activeEdges(graph, positionId);
  if (!edges.length) return "";
  const [mainEdge, ...alternates] = edges;
  const position = graph.positions[positionId];
  const moveNumber = Number(position.fen.split(" ")[5]) || 1;
  const isWhite = fenTurn(position.fen) === "white";

  let out = isWhite ? `${moveNumber}. ` : forceNumberForBlack ? `${moveNumber}... ` : "";
  out += mainEdge.san + glyphs(mainEdge);

  alternates.forEach((edge) => {
    let variation = (isWhite ? `${moveNumber}. ` : `${moveNumber}... `) + edge.san + glyphs(edge);
    const rest = renderFrom(graph, edge.to, false);
    if (rest) variation += ` ${rest}`;
    out += ` (${variation})`;
  });

  const rest = renderFrom(graph, mainEdge.to, !isWhite);
  return rest ? `${out} ${rest}` : out;
}

export interface ExportPgnOptions {
  headers?: Record<string, string>;
}

/** Exports the full move tree (mainlines, sidelines, comments and NAGs) as a single PGN game. */
export function exportPgn(graph: PositionGraph, options: ExportPgnOptions = {}): string {
  const root = graph.roots[0];
  if (!root || !graph.positions[root]) return "*";
  const rootFen = graph.positions[root].fen;
  const nonStandardStart = positionKey(rootFen) !== positionKey(START_FEN);

  const headers: Record<string, string> = {
    Event: "Out of Book export",
    Site: "-",
    Date: "????.??.??",
    Round: "-",
    White: "?",
    Black: "?",
    Result: "*",
    ...(nonStandardStart ? { SetUp: "1", FEN: rootFen } : {}),
    ...options.headers,
  };
  const headerBlock = Object.entries(headers)
    .map(([key, value]) => `[${key} "${escapeHeader(value)}"]`)
    .join("\n");

  const movetext = renderFrom(graph, root, fenTurn(rootFen) === "black");
  return `${headerBlock}\n\n${movetext ? `${movetext} *` : "*"}\n`;
}
