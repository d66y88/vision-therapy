/**
 * Small helpers for stimulus sampling without consecutive repeats.
 */

/**
 * Pick a random item from pool, preferring ones not equal to `exclude`.
 * If pool has only the excluded item (or is empty after filter), falls back to full pool.
 */
export function pickExcluding<T>(
  pool: readonly T[],
  exclude: T | null | undefined,
  equals: (a: T, b: T) => boolean = (a, b) => a === b,
): T {
  if (pool.length === 0) {
    throw new Error('pickExcluding: empty pool')
  }
  const filtered =
    exclude == null ? [...pool] : pool.filter((item) => !equals(item, exclude))
  const choices = filtered.length > 0 ? filtered : [...pool]
  return choices[Math.floor(Math.random() * choices.length)]!
}

/**
 * Pick a new angle (degrees) at least `minDelta` away from `prev` (circular 0–180 or 0–360).
 */
export function pickAngleExcluding(
  prev: number,
  minDelta: number,
  rangeMax = 180,
): number {
  for (let i = 0; i < 24; i += 1) {
    const next = Math.random() * rangeMax
    const diff = Math.min(
      Math.abs(next - prev),
      rangeMax - Math.abs(next - prev),
    )
    if (diff >= minDelta) return next
  }
  return (prev + minDelta + Math.random() * (rangeMax / 2)) % rangeMax
}
