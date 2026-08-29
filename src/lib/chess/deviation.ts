import { sampleByScore } from "./engine-strength";
import type { EngineCandidate } from "./types";

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
