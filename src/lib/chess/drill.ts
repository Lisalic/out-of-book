import { activeEdges } from "./graph";
import { fenTurn } from "./position-key";
import type { DrillLinePlan, PositionGraph, TraineeColor } from "./types";

/**
 * Picks a ply at which the opponent may leave the repertoire, constrained to plies at
 * or after the last of the line's decision positions — a deviation can never pre-empt
 * a decision the session actually means to drill.
 */
export function planLineDeviation(
  graph: PositionGraph,
  line: DrillLinePlan,
  traineeColor: TraineeColor,
  chance: number,
  random: () => number,
): number | null {
  if (random() >= chance) return null;
  let positionId = graph.roots[0];
  const remainingDecisions = new Set(line.decisionKeys);
  let pastAllDecisions = remainingDecisions.size === 0;
  const candidates: number[] = [];

  line.edgeUcis.forEach((uci, ply) => {
    const position = graph.positions[positionId];
    if (position && remainingDecisions.delete(position.id) && remainingDecisions.size === 0) pastAllDecisions = true;
    if (position && pastAllDecisions && fenTurn(position.fen) !== traineeColor) candidates.push(ply);
    const edge = activeEdges(graph, positionId).find((item) => item.uci === uci);
    if (edge) positionId = edge.to;
  });

  if (!candidates.length) return null;
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}
