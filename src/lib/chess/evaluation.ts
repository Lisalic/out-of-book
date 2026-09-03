import { fenTurn } from "./position-key";
import type { EngineAnalysis } from "./engine-adapter";

export function formatEvaluation(scoreCp: number): string {
  if (Math.abs(scoreCp) >= 99_000) {
    const mateIn = 100_000 - Math.abs(scoreCp);
    return `${scoreCp > 0 ? "+" : "−"}M${mateIn}`;
  }
  const pawns = scoreCp / 100;
  return `${pawns >= 0 ? "+" : "−"}${Math.abs(pawns).toFixed(1)}`;
}

/**
 * The analysis score as centipawns for White, which is how every display in the app reads
 * it. UCI reports scores from the side to move's point of view, so a black-to-move score
 * has to be negated — getting that backwards silently mirrors the evaluation bar.
 */
export function whitePerspectiveCp(analysis: EngineAnalysis, fen: string): number | null {
  const candidate = analysis.candidates.find((item) => item.uci === analysis.bestMove) ?? analysis.candidates[0];
  if (!candidate) return null;
  return fenTurn(fen) === "white" ? candidate.scoreCp : -candidate.scoreCp;
}
