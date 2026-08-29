import { activeEdges } from "./graph";
import { fenTurn, positionKey } from "./position-key";
import { gameResult, isCheckmate, isTerminal, playUci } from "./rules";
import type {
  DeviationFrequency,
  DrillProgress,
  MoveEdge,
  PendingMove,
  PositionGraph,
  TrainingPhase,
  TrainingSession,
  TraineeColor,
} from "./types";

function id(): string {
  return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso(now = Date.now()): string {
  return new Date(now).toISOString();
}

function phaseForTurn(fen: string, traineeColor: TraineeColor, inBook: boolean): TrainingPhase {
  if (isTerminal(fen)) return "complete";
  if (fenTurn(fen) === traineeColor) return inBook ? "trainee_turn" : "continuation";
  return inBook ? "opponent_book_turn" : "opponent_engine_turn";
}

export function createTrainingSession(args: {
  repertoireId: string;
  traineeColor: TraineeColor;
  rootFen: string;
  strength: number;
  deviationFrequency: DeviationFrequency;
  plannedDeviationPly: number | null;
  drill?: DrillProgress;
  now?: number;
}): TrainingSession {
  const timestamp = nowIso(args.now);
  return {
    id: id(),
    repertoireId: args.repertoireId,
    traineeColor: args.traineeColor,
    phase: phaseForTurn(args.rootFen, args.traineeColor, true),
    fen: args.rootFen,
    positionKey: positionKey(args.rootFen),
    startedAt: timestamp,
    updatedAt: timestamp,
    strength: args.strength,
    deviationFrequency: args.deviationFrequency,
    plannedDeviationPly: args.plannedDeviationPly,
    actualDeviationPly: null,
    takeoverReason: null,
    drill: args.drill,
    retryCount: 0,
    turnStartedAt: timestamp,
    moves: [],
    attempts: [],
  };
}

function pendingMove(session: TrainingSession, uci: string): PendingMove {
  const played = playUci(session.fen, uci);
  return {
    uci: played.uci,
    san: played.san,
    fenBefore: session.fen,
    fenAfter: played.fen,
    fromPositionKey: session.positionKey,
    toPositionKey: positionKey(played.fen),
  };
}

function appendMove(
  session: TrainingSession,
  move: PendingMove,
  actor: "trainee" | "opponent",
  source: "book" | "engine" | "trainee",
  now = Date.now(),
): TrainingSession {
  const continued = session.takeoverReason !== null || source === "engine";
  const terminal = isTerminal(move.fenAfter);
  return {
    ...session,
    fen: move.fenAfter,
    positionKey: move.toPositionKey,
    updatedAt: nowIso(now),
    turnStartedAt: nowIso(now),
    phase: terminal ? "complete" : phaseForTurn(move.fenAfter, session.traineeColor, !continued),
    lineCompletionReason: terminal ? (isCheckmate(move.fenAfter) ? "checkmate" : "game_over") : undefined,
    lineEvaluationCp: undefined,
    message: terminal ? gameResult(move.fenAfter) : undefined,
    pendingMove: undefined,
    moves: [
      ...session.moves,
      {
        ply: session.moves.length + 1,
        fenBefore: move.fenBefore,
        fenAfter: move.fenAfter,
        fromPositionKey: move.fromPositionKey,
        toPositionKey: move.toPositionKey,
        uci: move.uci,
        san: move.san,
        actor,
        source,
        playedAt: nowIso(now),
      },
    ],
  };
}

function completeAtBookEnd(session: TrainingSession, graph: PositionGraph, now = Date.now()): TrainingSession {
  if (session.phase === "complete" || session.takeoverReason !== null) return session;
  if (activeEdges(graph, session.positionKey).length > 0) return session;
  return {
    ...session,
    phase: "complete",
    lineCompletionReason: "book_complete",
    message: "Saved line complete.",
    updatedAt: nowIso(now),
  };
}

export function submitTraineeMove(
  session: TrainingSession,
  graph: PositionGraph,
  uci: string,
  now = Date.now(),
): TrainingSession {
  if (session.phase !== "trainee_turn" && session.phase !== "continuation") return session;
  const move = pendingMove(session, uci);
  if (session.phase === "continuation") return appendMove(session, move, "trainee", "trainee", now);

  const expected = activeEdges(graph, session.positionKey).filter((edge) => edge.isAccepted);
  const accepted = expected.some((edge) => edge.uci === move.uci);
  if (!accepted) {
    return {
      ...session,
      phase: "off_repertoire",
      pendingMove: move,
      retryCount: session.retryCount + 1,
      message: "That move is legal, but it is not in your repertoire.",
      updatedAt: nowIso(now),
    };
  }
  const result = session.retryCount > 0 ? "retry" : "first_try";
  const next = completeAtBookEnd(appendMove(session, move, "trainee", "trainee", now), graph, now);
  return {
    ...next,
    retryCount: 0,
    attempts: [
      ...session.attempts,
      {
        positionKey: session.positionKey,
        moveUci: move.uci,
        expectedMoveUcis: expected.map((edge) => edge.uci),
        result,
        responseMs: Math.max(0, now - Date.parse(session.turnStartedAt)),
      },
    ],
    message: result === "retry" ? "Back in book." : next.message,
  };
}

export function retryRepertoireMove(session: TrainingSession, now = Date.now()): TrainingSession {
  if (session.phase !== "off_repertoire") return session;
  return {
    ...session,
    phase: "trainee_turn",
    pendingMove: undefined,
    message: "Try another repertoire move.",
    turnStartedAt: nowIso(now),
    updatedAt: nowIso(now),
  };
}

/** Auto-plays a saved repertoire move for the trainee — the coach card's "Show answer". Graded as a lapse. */
export function revealRepertoireMove(session: TrainingSession, graph: PositionGraph, now = Date.now()): TrainingSession {
  if (session.phase !== "off_repertoire") return session;
  const expected = activeEdges(graph, session.positionKey).filter((edge) => edge.isAccepted);
  const answer = expected[0];
  if (!answer) return session;
  const attemptedUci = session.pendingMove?.uci ?? answer.uci;
  const move = pendingMove(session, answer.uci);
  const next = completeAtBookEnd(appendMove(session, move, "trainee", "trainee", now), graph, now);
  return {
    ...next,
    retryCount: 0,
    attempts: [
      ...session.attempts,
      {
        positionKey: session.positionKey,
        moveUci: attemptedUci,
        expectedMoveUcis: expected.map((edge) => edge.uci),
        result: "revealed",
        responseMs: Math.max(0, now - Date.parse(session.turnStartedAt)),
      },
    ],
  };
}

/** Commits the trainee's rejected move anyway and switches straight into a normal (non-repertoire) game. */
export function playPendingMoveAnyway(session: TrainingSession, graph: PositionGraph, now = Date.now()): TrainingSession {
  if (session.phase !== "off_repertoire" || !session.pendingMove) return session;
  const expected = activeEdges(graph, session.positionKey).filter((edge) => edge.isAccepted);
  const attemptedUci = session.pendingMove.uci;
  const takeover = beginEngineTakeover(session, now);
  const played = submitTraineeMove(takeover, graph, attemptedUci, now);
  return {
    ...played,
    retryCount: 0,
    attempts: [
      ...session.attempts,
      {
        positionKey: session.positionKey,
        moveUci: attemptedUci,
        expectedMoveUcis: expected.map((edge) => edge.uci),
        result: "revealed",
        responseMs: Math.max(0, now - Date.parse(session.turnStartedAt)),
      },
    ],
  };
}

export function applyOpponentBookMove(
  session: TrainingSession,
  graph: PositionGraph,
  edge: MoveEdge,
  now = Date.now(),
): TrainingSession {
  if (session.phase !== "opponent_book_turn") return session;
  const move = pendingMove(session, edge.uci);
  return completeAtBookEnd(appendMove(session, move, "opponent", "book", now), graph, now);
}

export function beginEngineTakeover(
  session: TrainingSession,
  now = Date.now(),
): TrainingSession {
  return {
    ...session,
    takeoverReason: "deviation",
    actualDeviationPly: session.moves.length,
    phase: fenTurn(session.fen) === session.traineeColor ? "continuation" : "opponent_engine_turn",
    message: "The opponent left your repertoire. Play the position.",
    updatedAt: nowIso(now),
  };
}

export function applyEngineMove(session: TrainingSession, uci: string, now = Date.now()): TrainingSession {
  if (session.phase !== "opponent_engine_turn") return session;
  const move = pendingMove(session, uci);
  return appendMove(session, move, "opponent", "engine", now);
}

export function completeSession(session: TrainingSession, message = "Game ended by player"): TrainingSession {
  if (!session.takeoverReason) return session;
  return {
    ...session,
    phase: "complete",
    lineCompletionReason: "user_ended",
    message,
    updatedAt: nowIso(),
  };
}

export function setLineEvaluation(session: TrainingSession, evaluationCp: number | null): TrainingSession {
  return { ...session, lineEvaluationCp: evaluationCp, updatedAt: nowIso() };
}

function recordCurrentLine(session: TrainingSession): TrainingSession {
  if (!session.drill) return session;
  const index = session.drill.currentLineIndex;
  if (session.drill.completedLines.some((line) => line.lineIndex === index)) return session;
  const line = session.drill.lines[index];
  return {
    ...session,
    drill: {
      ...session.drill,
      completedLines: [
        ...session.drill.completedLines,
        {
          lineIndex: index,
          targetPositionKey: line?.targetPositionKey ?? session.positionKey,
          completionReason: session.lineCompletionReason ?? "book_complete",
          leftBook: session.takeoverReason !== null,
          finalFen: session.fen,
          evaluationCp: session.lineEvaluationCp,
          moves: session.moves,
          attempts: session.attempts,
        },
      ],
    },
  };
}

export function advanceDrillLine(
  session: TrainingSession,
  rootFen: string,
  plannedDeviationPly: number | null,
  now = Date.now(),
): TrainingSession {
  const recorded = recordCurrentLine(session);
  if (!recorded.drill || recorded.phase !== "complete") return recorded;
  const nextIndex = recorded.drill.currentLineIndex + 1;
  if (nextIndex >= recorded.drill.lines.length) return recorded;
  const next = createTrainingSession({
    repertoireId: recorded.repertoireId,
    traineeColor: recorded.traineeColor,
    rootFen,
    strength: recorded.strength,
    deviationFrequency: recorded.deviationFrequency,
    plannedDeviationPly,
    now,
    drill: {
      ...recorded.drill,
      currentLineIndex: nextIndex,
    },
  });
  return { ...next, id: recorded.id, startedAt: recorded.startedAt };
}

export function openReview(session: TrainingSession): TrainingSession {
  const recorded = recordCurrentLine(session);
  return { ...recorded, phase: "review", updatedAt: nowIso() };
}
