import { activeEdges } from "./graph";
import { fenTurn } from "./position-key";
import type { DrillLinePlan, PositionGraph, ReviewGrade, ReviewState, TraineeColor } from "./types";

/**
 * Shortest edge-UCI route from the repertoire root to every reachable position,
 * one breadth-first walk over the graph. O(positions + edges) — this is the
 * replacement for the old exhaustive root-to-leaf enumeration, which was
 * exponential in branching factor and froze the UI on any wide repertoire.
 */
export function buildRouteIndex(graph: PositionGraph): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const root = graph.roots[0];
  if (!root || !graph.positions[root]) return index;
  index.set(root, []);
  const queue: string[] = [root];
  while (queue.length) {
    const current = queue.shift()!;
    const route = index.get(current)!;
    for (const edge of activeEdges(graph, current)) {
      if (index.has(edge.to)) continue;
      index.set(edge.to, [...route, edge.uci]);
      queue.push(edge.to);
    }
  }
  return index;
}

/**
 * Positions reachable from the root where it is the trainee's move and at
 * least one accepted move is saved — the atomic unit of training. Linear in
 * the size of the graph, unlike enumerating full lines.
 */
export function decisionPositions(graph: PositionGraph, traineeColor: TraineeColor): string[] {
  const routeIndex = buildRouteIndex(graph);
  const result: string[] = [];
  for (const id of routeIndex.keys()) {
    const position = graph.positions[id];
    if (!position || fenTurn(position.fen) !== traineeColor) continue;
    if (activeEdges(graph, id).some((edge) => edge.isAccepted)) result.push(id);
  }
  return result;
}

/** Walks the mainline (or first saved move) forward from a position to a leaf. */
function extendToLeaf(graph: PositionGraph, startId: string): string[] {
  const ucis: string[] = [];
  const visited = new Set([startId]);
  let current = startId;
  while (true) {
    const [edge] = activeEdges(graph, current);
    if (!edge || visited.has(edge.to)) break;
    ucis.push(edge.uci);
    visited.add(edge.to);
    current = edge.to;
  }
  return ucis;
}

/**
 * One playable line per requested decision position: the route to it, then
 * its saved continuation to a leaf. Cost is O(route length + tail length)
 * per line, never a scan of every branch in the repertoire.
 */
export function buildSessionLines(
  graph: PositionGraph,
  targetKeys: string[],
  routeIndex: Map<string, string[]>,
): DrillLinePlan[] {
  const lines: DrillLinePlan[] = [];
  targetKeys.forEach((key, index) => {
    const route = routeIndex.get(key);
    if (!route) return;
    lines.push({
      id: `line-${index + 1}`,
      targetPositionKey: key,
      edgeUcis: [...route, ...extendToLeaf(graph, key)],
    });
  });
  return lines;
}

/**
 * Chooses which decision positions make up a session: overdue first (oldest
 * due date first), then positions never reviewed, then — only to pad a
 * fixed-size session — the weakest known positions. Pass size "all" to take
 * every due-or-new position with no padding.
 */
function isDue(state: ReviewState | undefined, now: number): boolean {
  return state !== undefined && Date.parse(state.due) <= now;
}

/** How many of these decision positions are currently due for review. */
export function dueCount(decisionKeys: string[], states: Map<string, ReviewState>, now = Date.now()): number {
  return decisionKeys.filter((key) => isDue(states.get(key), now)).length;
}

export function selectSession(
  decisionKeys: string[],
  states: Map<string, ReviewState>,
  size: number | "all",
  now = Date.now(),
): string[] {
  const due = decisionKeys
    .filter((key) => isDue(states.get(key), now))
    .sort((a, b) => Date.parse(states.get(a)!.due) - Date.parse(states.get(b)!.due));

  const fresh = decisionKeys.filter((key) => !states.has(key));
  const chosen = new Set([...due, ...fresh]);

  if (size === "all") return [...due, ...fresh];

  const weak = decisionKeys
    .filter((key) => !chosen.has(key))
    .sort((a, b) => {
      const stateA = states.get(a)!;
      const stateB = states.get(b)!;
      return stateA.ease - stateB.ease || stateB.lapses - stateA.lapses;
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
