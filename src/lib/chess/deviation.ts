import { sampleByScore } from "./engine-strength";
import type { DeviationFrequency, EngineCandidate } from "./types";

/**
 * How often the opponent is allowed to leave the book, as one table: the label the
 * setup screen shows and the probability the drill planner uses are the same setting,
 * so a copy shown to the trainee can never drift from the odds they actually get.
 */
export const DEVIATION_FREQUENCIES: ReadonlyArray<{ value: DeviationFrequency; label: string; chance: number }> = [
  { value: "never", label: "Never", chance: 0 },
  { value: "low", label: "Occasionally", chance: 0.1 },
  { value: "medium", label: "Sometimes", chance: 0.25 },
  { value: "high", label: "Often", chance: 0.5 },
];

export function deviationChance(frequency: DeviationFrequency): number {
  return DEVIATION_FREQUENCIES.find((option) => option.value === frequency)?.chance ?? 0;
}

export function formatChance(chance: number): string {
  return `${Math.round(chance * 100)}%`;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function lossCap(strength: number): number {
  if (strength >= 1900) return 80;
  if (strength >= 1500) return 140;
  if (strength >= 1100) return 220;
  return 320;
}

export function selectDeviation(
  candidates: EngineCandidate[],
  savedUcis: string[],
  legalUcis: string[],
  strength: number,
  random: () => number,
): EngineCandidate | null {
  const saved = new Set(savedUcis);
  const legal = new Set(legalUcis);
  const valid = candidates.filter((candidate) => legal.has(candidate.uci) && !saved.has(candidate.uci));
  const temperature = Math.max(35, 260 - strength / 8);
  return sampleByScore(valid, lossCap(strength), temperature, random);
}
