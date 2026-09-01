export type TraineeColor = "white" | "black";

export interface PositionNode {
  id: string;
  key: string;
  fen: string;
  minPly: number;
}

export interface MoveEdge {
  id: string;
  from: string;
  to: string;
  uci: string;
  san: string;
  isAccepted: boolean;
  isMainline: boolean;
  sortOrder: number;
  comments: string[];
  nags: number[];
  deletedAt?: string;
}

export interface PositionGraph {
  positions: Record<string, PositionNode>;
  edges: Record<string, MoveEdge>;
  outgoing: Record<string, string[]>;
  roots: string[];
}

export interface Repertoire {
  id: string;
  name: string;
  traineeColor: TraineeColor;
  sourcePresetId?: string;
  graph: PositionGraph;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface ImportPreview {
  graph: PositionGraph;
  gameCount: number;
  positionCount: number;
  moveCount: number;
  traineeDecisionCount: number;
  branchCount: number;
  maximumDepth: number;
  transpositionCount: number;
  restoredMoveCount: number;
  warnings: string[];
}

export interface MoveLedgerEntry {
  ply: number;
  fenBefore: string;
  fenAfter: string;
  fromPositionKey: string;
  toPositionKey: string;
  uci: string;
  san: string;
  actor: "trainee" | "opponent";
  source: "book" | "engine" | "trainee";
  playedAt: string;
}

/** "revealed" covers both giving up (Show answer) and playing an off-book move anyway. */
export interface RecallAttempt {
  positionKey: string;
  moveUci: string;
  expectedMoveUcis: string[];
  result: "first_try" | "retry" | "revealed";
  responseMs: number;
}

export type LineCompletionReason = "book_complete" | "user_ended" | "checkmate" | "game_over";

export interface DrillLinePlan {
  id: string;
  /** Every trainee decision along this line's route, root to leaf, in the order they're reached — each is graded independently once the line is played. */
  decisionKeys: string[];
  edgeUcis: string[];
}

export interface DrillLineResult {
  lineIndex: number;
  decisionKeys: string[];
  completionReason: LineCompletionReason;
  leftBook: boolean;
  finalFen: string;
  evaluationCp?: number | null;
  moves: MoveLedgerEntry[];
  attempts: RecallAttempt[];
}

export interface DrillProgress {
  lines: DrillLinePlan[];
  currentLineIndex: number;
  completedLines: DrillLineResult[];
  deviationChance: number;
}

export type TrainingPhase =
  | "trainee_turn"
  | "opponent_book_turn"
  | "opponent_engine_turn"
  | "off_repertoire"
  | "continuation"
  | "complete"
  | "review";

export interface PendingMove {
  uci: string;
  san: string;
  fenBefore: string;
  fenAfter: string;
  fromPositionKey: string;
  toPositionKey: string;
}

export interface TrainingSession {
  id: string;
  repertoireId: string;
  traineeColor: TraineeColor;
  phase: TrainingPhase;
  fen: string;
  positionKey: string;
  startedAt: string;
  updatedAt: string;
  strength: number;
  deviationFrequency: DeviationFrequency;
  plannedDeviationPly: number | null;
  actualDeviationPly: number | null;
  takeoverReason: "deviation" | null;
  lineCompletionReason?: LineCompletionReason;
  lineEvaluationCp?: number | null;
  drill?: DrillProgress;
  retryCount: number;
  turnStartedAt: string;
  pendingMove?: PendingMove;
  message?: string;
  moves: MoveLedgerEntry[];
  attempts: RecallAttempt[];
}

export type DeviationFrequency = "never" | "low" | "medium" | "high";

export interface EngineCandidate {
  uci: string;
  scoreCp: number;
  depth: number;
  pv: string[];
}

/** Spaced-repetition state for one decision position within one repertoire. */
export interface ReviewState {
  /** `${repertoireId}:${positionKey}` — the storage key. */
  id: string;
  repertoireId: string;
  positionKey: string;
  due: string;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  updatedAt: string;
}

export type ReviewGrade = "again" | "hard" | "good";
