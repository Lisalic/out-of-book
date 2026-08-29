import type { EngineCandidate } from "./types";

/**
 * Lozza has no UCI_Elo/UCI_LimitStrength option, so "approximate strength" is
 * simulated here rather than delegated to the engine: a shorter search budget
 * for weaker settings (genuinely shallower, not just deliberately worse play),
 * plus weighted sampling among its MultiPV candidates so it doesn't always
 * play the objectively best move.
 */
export const MIN_ENGINE_ELO = 900;
export const MAX_ENGINE_ELO = 2200;

/**
 * Search time budget for a given approximate strength — weaker play searches a bit less
 * deeply too. Kept a mild curve (0.75x-1.3x): MultiPV needs real depth to populate more
 * than one or two candidates, and weightedCandidate below is the primary strength lever —
 * starving the search would leave it nothing to weight among.
 */
export function moveTimeForStrength(strength: number, baseMs = 300): number {
  const clamped = Math.max(MIN_ENGINE_ELO, Math.min(MAX_ENGINE_ELO, strength));
  const t = (clamped - MIN_ENGINE_ELO) / (MAX_ENGINE_ELO - MIN_ENGINE_ELO);
  return Math.round(baseMs * (0.75 + 0.55 * t));
}

/**
 * Samples one candidate the way a player might choose among near-best
 * options: candidates losing more than `lossCapCp` to the best score are
 * excluded outright, and among the rest, better scores are exponentially
 * more likely at the given `temperature` (higher = flatter, more random).
 * Shared by deviation selection (deviation.ts, which supplies its own looser
 * tuning — a plausible off-book try doesn't have to be the strongest reply)
 * and general strength-limited play (weightedCandidate below).
 */
export function sampleByScore(
  candidates: EngineCandidate[],
  lossCapCp: number,
  temperature: number,
  random: () => number,
): EngineCandidate | null {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((a, b) => b.scoreCp - a.scoreCp);
  const best = sorted[0].scoreCp;
  const plausible = sorted.filter((candidate) => best - candidate.scoreCp <= lossCapCp);
  if (!plausible.length) return null;
  const weights = plausible.map((candidate) => Math.exp(-(best - candidate.scoreCp) / temperature));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = random() * total;
  for (let index = 0; index < plausible.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return plausible[index];
  }
  return plausible.at(-1) ?? null;
}

function lossCapForPlay(strength: number): number {
  if (strength >= 1900) return 40;
  if (strength >= 1500) return 90;
  if (strength >= 1100) return 160;
  return 260;
}

/**
 * Picks among candidates the way a player of the given approximate strength
 * would play on. sampleByScore only returns null for an empty input, since
 * the best candidate always satisfies its own loss cap.
 */
export function weightedCandidate(
  candidates: EngineCandidate[],
  strength: number,
  random: () => number,
): EngineCandidate | null {
  const temperature = Math.max(30, 240 - strength / 9);
  return sampleByScore(candidates, lossCapForPlay(strength), temperature, random);
}
