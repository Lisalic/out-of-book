import { activeEdges } from "./graph";
import { fenTurn } from "./position-key";
import type { DrillLinePlan, PositionGraph, ReviewGrade, ReviewState, TraineeColor } from "./types";

/**
 * Positions reachable from the root where it is the trainee's move and at least one
 * accepted move is saved — the individual branch points that make up a line. This is
 * the unit spaced-repetition scheduling grades independently (see `ReviewState`); it is
 * not the unit a player thinks in, which is a whole line (`repertoireLines`) — a single
 * line commonly strings several of these decisions together. One linear pass over the
 * graph, unlike enumerating full lines.
 */
export function decisionPositions(graph: PositionGraph, traineeColor: TraineeColor): string[] {
  const root = graph.roots[0];
  if (!root || !graph.positions[root]) return [];
  const visited = new Set([root]);
  const queue = [root];
  let index = 0;
  const result: string[] = [];
  while (index < queue.length) {
    const current = queue[index++];
    const position = graph.positions[current];
    const edges = activeEdges(graph, current);
    if (position && fenTurn(position.fen) === traineeColor && edges.some((edge) => edge.isAccepted)) result.push(current);
    for (const edge of edges) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      queue.push(edge.to);
    }
  }
  return result;
}

/**
 * Every distinct root-to-leaf variation in the repertoire that carries at least one
 * trainee decision — the "lines" a player actually recognizes, as opposed to the
 * individual branch points (`decisionPositions`) that make them up. A single line
 * commonly strings several decisions together, and an earlier decision can belong to
 * more than one line if the repertoire branches again further on. One breadth-first
 * pass over the graph — O(positions + edges), never a walk of every branch (which would
 * be exponential in branching factor).
 */
export function repertoireLines(graph: PositionGraph, traineeColor: TraineeColor): DrillLinePlan[] {
  const root = graph.roots[0];
  if (!root || !graph.positions[root]) return [];
  const edgeUcis = new Map<string, string[]>([[root, []]]);
  const idPath = new Map<string, string[]>([[root, [root]]]);
  const decisionKeys = new Set<string>();
  const nonLeaf = new Set<string>();
  const queue = [root];
  let index = 0;
  while (index < queue.length) {
    const current = queue[index++];
    const ucis = edgeUcis.get(current)!;
    const path = idPath.get(current)!;
    const position = graph.positions[current];
    const edges = activeEdges(graph, current);
    if (edges.length > 0) nonLeaf.add(current);
    if (position && fenTurn(position.fen) === traineeColor && edges.some((edge) => edge.isAccepted)) decisionKeys.add(current);
    for (const edge of edges) {
      if (edgeUcis.has(edge.to)) continue;
      edgeUcis.set(edge.to, [...ucis, edge.uci]);
      idPath.set(edge.to, [...path, edge.to]);
      queue.push(edge.to);
    }
  }

  const lines: DrillLinePlan[] = [];
  for (const [leafId, path] of idPath) {
    if (path.length < 2 || nonLeaf.has(leafId)) continue;
    const lineDecisionKeys = path.filter((id) => decisionKeys.has(id));
    if (!lineDecisionKeys.length) continue;
    lines.push({ id: leafId, edgeUcis: edgeUcis.get(leafId)!, decisionKeys: lineDecisionKeys });
  }
  return lines;
}

function isDue(state: ReviewState | undefined, now: number): boolean {
  return state !== undefined && Date.parse(state.due) <= now;
}

/** The earliest due timestamp among a line's due decisions, or undefined if none are due. */
function lineDueTimestamp(line: DrillLinePlan, states: Map<string, ReviewState>, now: number): number | undefined {
  let earliest: number | undefined;
  for (const key of line.decisionKeys) {
    const state = states.get(key);
    if (!state || !isDue(state, now)) continue;
    const due = Date.parse(state.due);
    if (earliest === undefined || due < earliest) earliest = due;
  }
  return earliest;
}

/** Whether any decision in the line has never been reviewed. */
function lineHasFreshDecision(line: DrillLinePlan, states: Map<string, ReviewState>): boolean {
  return line.decisionKeys.some((key) => !states.has(key));
}

/** The line's worst (lowest-ease, most-lapsed) reviewed decision — used only to rank padding candidates. */
function lineWeakness(line: DrillLinePlan, states: Map<string, ReviewState>): { ease: number; lapses: number } {
  let worst = { ease: Infinity, lapses: -Infinity };
  for (const key of line.decisionKeys) {
    const state = states.get(key);
    if (!state) continue;
    if (state.ease < worst.ease || (state.ease === worst.ease && state.lapses > worst.lapses)) {
      worst = { ease: state.ease, lapses: state.lapses };
    }
  }
  return worst;
}

/** How many of these lines currently have a decision due for review. */
export function dueLineCount(lines: DrillLinePlan[], states: Map<string, ReviewState>, now = Date.now()): number {
  return lines.filter((line) => lineDueTimestamp(line, states, now) !== undefined).length;
}

/**
 * Chooses which lines make up a session: lines with an overdue decision first (most
 * overdue line first), then lines still carrying a never-reviewed decision, then — only
 * to pad a fixed-size session — the weakest known lines. Pass size "all" to take every
 * due-or-new line with no padding.
 */
export function selectLineSession(
  lines: DrillLinePlan[],
  states: Map<string, ReviewState>,
  size: number | "all",
  now = Date.now(),
): DrillLinePlan[] {
  const due = lines
    .map((line) => ({ line, due: lineDueTimestamp(line, states, now) }))
    .filter((entry): entry is { line: DrillLinePlan; due: number } => entry.due !== undefined)
    .sort((a, b) => a.due - b.due)
    .map((entry) => entry.line);

  const dueIds = new Set(due.map((line) => line.id));
  const fresh = lines.filter((line) => !dueIds.has(line.id) && lineHasFreshDecision(line, states));
  const chosenIds = new Set([...dueIds, ...fresh.map((line) => line.id)]);

  if (size === "all") return [...due, ...fresh];

  const weak = lines
    .filter((line) => !chosenIds.has(line.id))
    .sort((a, b) => {
      const weaknessA = lineWeakness(a, states);
      const weaknessB = lineWeakness(b, states);
      return weaknessA.ease - weaknessB.ease || weaknessB.lapses - weaknessA.lapses;
    });

  return [...due, ...fresh, ...weak].slice(0, size);
}

const MINIMUM_EASE = 1.3;
const DAY_MS = 86_400_000;

export function reviewStateId(repertoireId: string, positionKey: string): string {
  return `${repertoireId}:${positionKey}`;
}

export function initialReviewState(repertoireId: string, positionKey: string, now = Date.now()): ReviewState {
  const timestamp = new Date(now).toISOString();
  return {
    id: reviewStateId(repertoireId, positionKey),
    repertoireId,
    positionKey,
    due: timestamp,
    intervalDays: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    updatedAt: timestamp,
  };
}

/** SM-2-lite: three-button grading (again / hard / good) instead of a 0-5 scale. */
export function grade(state: ReviewState, result: ReviewGrade, now = Date.now()): ReviewState {
  let { ease, intervalDays, reps, lapses } = state;
  if (result === "again") {
    lapses += 1;
    reps = 0;
    ease = Math.max(MINIMUM_EASE, ease - 0.2);
    intervalDays = 1 / 24;
  } else {
    reps += 1;
    if (result === "hard") {
      ease = Math.max(MINIMUM_EASE, ease - 0.15);
      intervalDays = reps === 1 ? 1 : Math.max(1, Math.round(intervalDays * 1.2));
    } else {
      intervalDays = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(intervalDays * ease);
    }
  }
  return {
    ...state,
    ease,
    intervalDays,
    reps,
    lapses,
    due: new Date(now + intervalDays * DAY_MS).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
}

export function gradeForAttemptResult(result: "first_try" | "retry" | "revealed"): ReviewGrade {
  if (result === "first_try") return "good";
  if (result === "retry") return "hard";
  return "again";
}
