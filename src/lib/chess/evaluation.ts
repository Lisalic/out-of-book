export function formatEvaluation(scoreCp: number): string {
  if (Math.abs(scoreCp) >= 99_000) {
    const mateIn = 100_000 - Math.abs(scoreCp);
    return `${scoreCp > 0 ? "+" : "−"}M${mateIn}`;
  }
  const pawns = scoreCp / 100;
  return `${pawns >= 0 ? "+" : "−"}${Math.abs(pawns).toFixed(1)}`;
}
