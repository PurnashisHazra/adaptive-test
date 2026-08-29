/** Percentage = scored marks / max marks × 100. */
export function percentageFromMarks(scored: number | null | undefined, max: number | null | undefined): number {
  const s = Number(scored);
  const m = Number(max);
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return 0;
  return (s / m) * 100;
}
