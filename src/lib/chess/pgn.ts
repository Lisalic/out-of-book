import { Chess } from "chess.js";
import { activeEdges, addGraphMove, emptyGraph, ensurePosition } from "./graph";
import { fenTurn, positionKey } from "./position-key";
import type { ImportPreview, MoveEdge, PositionGraph, TraineeColor } from "./types";

const LIMITS = {
  bytes: 5 * 1024 * 1024,
  games: 500,
  nodes: 50_000,
  depth: 500,
  commentLength: 10_000,
};

interface PgnGame {
  headers: Record<string, string>;
  movetext: string;
}

export class PgnImportError extends Error {
  constructor(message: string, public readonly game: number, public readonly ply: number) {
    super(`Game ${game}, ply ${ply}: ${message}`);
    this.name = "PgnImportError";
  }
}

function splitGames(pgn: string): PgnGame[] {
  const games: PgnGame[] = [];
  let headers: Record<string, string> = {};
  let moves: string[] = [];
  let movetextStarted = false;

  const commit = () => {
    const movetext = moves.join("\n").trim();
    if (movetext) games.push({ headers, movetext });
    headers = {};
    moves = [];
    movetextStarted = false;
  };

  for (const line of pgn.replace(/\r\n?/g, "\n").split("\n")) {
    const header = line.match(/^\s*\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"])*)"\]\s*$/);
    if (header) {
      if (movetextStarted) commit();
      headers[header[1]] = header[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      continue;
    }
    if (line.trim()) movetextStarted = true;
    moves.push(line);
  }
  commit();
  return games;
}

function tokenize(movetext: string): string[] {
  return movetext.match(/\{[^}]*\}|;[^\n]*|\(|\)|\$\d+|1-0|0-1|1\/2-1\/2|\*|[^\s(){};]+/g) ?? [];
}

function cleanMoveToken(token: string): string | null {
  let clean = token.trim();
  clean = clean.replace(/^\d+\.(?:\.\.)?/, "");
  if (!clean || /^\d+\.{1,3}$/.test(clean) || clean === "...") return null;
  if (["1-0", "0-1", "1/2-1/2", "*"].includes(clean)) return null;
  if (/^e\.?p\.?$/i.test(clean)) return null;
  return clean.replace(/[!?]+$/g, "");
}

function startingFen(headers: Record<string, string>): string {
  if (headers.SetUp === "1" && headers.FEN) return new Chess(headers.FEN).fen();
  return new Chess().fen();
}

export interface ImportPgnOptions {
  /** When given, a game whose starting position differs from this graph's root is rejected, and moves the import would otherwise silently resurrect are counted instead of restored. */
  targetGraph?: PositionGraph;
}

export function importPgn(pgn: string, traineeColor: TraineeColor, options: ImportPgnOptions = {}): ImportPreview {
  if (!pgn.trim()) throw new PgnImportError("Paste at least one PGN game", 1, 0);
  if (new TextEncoder().encode(pgn).byteLength > LIMITS.bytes) {
    throw new PgnImportError("PGN exceeds the 5 MB local import limit", 1, 0);
  }
  const games = splitGames(pgn);
  if (!games.length) throw new PgnImportError("No move text found", 1, 0);
  if (games.length > LIMITS.games) throw new PgnImportError(`PGN exceeds ${LIMITS.games} games`, 1, 0);

  const graph = emptyGraph();
  let maximumDepth = 0;
  let totalPositionVisits = 0;
  const warnings: string[] = [];
  const expectedRootKey = options.targetGraph?.roots[0]
    ? positionKey(options.targetGraph.positions[options.targetGraph.roots[0]].fen)
    : undefined;

  games.forEach((game, gameIndex) => {
    const rootFen = startingFen(game.headers);
    if (expectedRootKey && positionKey(rootFen) !== expectedRootKey) {
      throw new PgnImportError(
        "starts from a different position than this repertoire's root — import a PGN that begins from the same position",
        gameIndex + 1,
        0,
      );
    }
    const root = ensurePosition(graph, rootFen, 0).id;
    if (!graph.roots.includes(root)) graph.roots.push(root);
    let chess = new Chess(rootFen);
    let ply = 0;
    let lastBeforeFen: string | undefined;
    let lastEdge: MoveEdge | undefined;
    const stack: Array<{
      fen: string;
      ply: number;
      lastBeforeFen?: string;
      lastEdge?: MoveEdge;
    }> = [];

    for (const rawToken of tokenize(game.movetext)) {
      if (rawToken === "(") {
        if (!lastBeforeFen) throw new PgnImportError("Variation has no preceding move", gameIndex + 1, ply);
        stack.push({ fen: chess.fen(), ply, lastBeforeFen, lastEdge });
        chess = new Chess(lastBeforeFen);
        ply = Math.max(0, ply - 1);
        lastBeforeFen = undefined;
        lastEdge = undefined;
        continue;
      }
      if (rawToken === ")") {
        const context = stack.pop();
        if (!context) throw new PgnImportError("Unexpected closing variation", gameIndex + 1, ply);
        chess = new Chess(context.fen);
        ply = context.ply;
        lastBeforeFen = context.lastBeforeFen;
        lastEdge = context.lastEdge;
        continue;
      }
      if (rawToken.startsWith("{" ) || rawToken.startsWith(";")) {
        const comment = rawToken.replace(/^\{|\}$/g, "").replace(/^;/, "").trim().slice(0, LIMITS.commentLength);
        if (comment && lastEdge && !lastEdge.comments.includes(comment)) lastEdge.comments.push(comment);
        continue;
      }
      if (/^\$\d+$/.test(rawToken)) {
        const nag = Number(rawToken.slice(1));
        if (lastEdge && !lastEdge.nags.includes(nag)) lastEdge.nags.push(nag);
        continue;
      }
      const token = cleanMoveToken(rawToken);
      if (!token) continue;
      if (ply >= LIMITS.depth) throw new PgnImportError(`Variation exceeds ${LIMITS.depth} plies`, gameIndex + 1, ply);
      const before = chess.fen();
      try {
        const move = chess.move(token);
        if (!move) throw new Error("illegal move");
        lastEdge = addGraphMove(graph, before, move.san, traineeColor, {
          ply,
          isMainline: stack.length === 0,
        });
      } catch {
        throw new PgnImportError(`Illegal or unsupported move “${rawToken}”`, gameIndex + 1, ply + 1);
      }
      lastBeforeFen = before;
      ply += 1;
      totalPositionVisits += 1;
      maximumDepth = Math.max(maximumDepth, ply);
      if (Object.keys(graph.positions).length > LIMITS.nodes) {
        throw new PgnImportError(`Import exceeds ${LIMITS.nodes.toLocaleString()} positions`, gameIndex + 1, ply);
      }
    }
    if (stack.length) throw new PgnImportError("Unclosed variation", gameIndex + 1, ply);
  });

  const positions = Object.values(graph.positions);
  const edges = Object.values(graph.edges);
  const traineeDecisionCount = positions.filter((position) =>
    fenTurn(position.fen) === traineeColor && activeEdges(graph, position.id).some((edge) => edge.isAccepted),
  ).length;
  const branchCount = positions.filter((position) => activeEdges(graph, position.id).length > 1).length;
  const conflictPositions = positions.filter(
    (position) => activeEdges(graph, position.id).filter((edge) => edge.isAccepted).length > 1,
  );
  if (conflictPositions.length) {
    warnings.push(`${conflictPositions.length} position${conflictPositions.length === 1 ? " has" : "s have"} multiple accepted moves.`);
  }
  if (graph.roots.length > 1) warnings.push(`${graph.roots.length} distinct starting positions were imported.`);

  const restoredMoveCount = options.targetGraph
    ? edges.filter((edge) => options.targetGraph!.edges[edge.id]?.deletedAt).length
    : 0;

  return {
    graph,
    gameCount: games.length,
    positionCount: positions.length,
    moveCount: edges.length,
    traineeDecisionCount,
    branchCount,
    maximumDepth,
    transpositionCount: Math.max(0, totalPositionVisits + graph.roots.length - positions.length),
    restoredMoveCount,
    warnings,
  };
}
