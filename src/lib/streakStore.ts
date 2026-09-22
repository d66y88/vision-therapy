/**
 * Daily check-in / streak helpers for adherence (local-only).
 */

import { localDayKey } from '../store/trainingTimerStore'

const STORAGE_KEY = 'vision_streak'

interface StreakFile {
  /** Sorted unique YYYY-MM-DD keys with at least one playlist game done. */
  days: string[]
  /** Last day a make-up credit was used. */
  makeupUsedOn?: string
}

function load(): StreakFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { days: [] }
    const parsed = JSON.parse(raw) as StreakFile
    return {
      days: Array.isArray(parsed.days) ? parsed.days : [],
      makeupUsedOn: parsed.makeupUsedOn,
    }
  } catch {
    return { days: [] }
  }
}

function save(data: StreakFile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function prevDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  return localDayKey(dt)
}

/** Record that today had meaningful training (playlist progress). */
export function markStreakDay(dayKey = localDayKey()): void {
  const data = load()
  if (!data.days.includes(dayKey)) {
    data.days.push(dayKey)
    data.days.sort()
    save(data)
  }
}

/** Current consecutive-day streak ending today (or yesterday if not yet trained). */
export function getCurrentStreak(now = new Date()): number {
  const data = load()
  const set = new Set(data.days)
  let cursor = localDayKey(now)
  if (!set.has(cursor)) {
    cursor = prevDayKey(cursor)
    if (!set.has(cursor)) return 0
  }
  let n = 0
  while (set.has(cursor)) {
    n += 1
    cursor = prevDayKey(cursor)
  }
  return n
}

/** Last 28 day keys → heat map (true = trained). */
export function getHeatmapDays(count = 28, now = new Date()): { dayKey: string; done: boolean }[] {
  const set = new Set(load().days)
  const out: { dayKey: string; done: boolean }[] = []
  for (let i = count - 1; i >= 0; i -= 1) {
    const dt = new Date(now)
    dt.setDate(dt.getDate() - i)
    const key = localDayKey(dt)
    out.push({ dayKey: key, done: set.has(key) })
  }
  return out
}

/**
 * Soft recovery: if yesterday was missed and today completed ≥1 game,
 * treat as continuous (no shame messaging). Returns whether streak was bridged.
 */
export function tryMakeupBridge(dayKey = localDayKey()): boolean {
  const data = load()
  const yesterday = prevDayKey(dayKey)
  if (data.days.includes(yesterday)) return false
  if (data.makeupUsedOn === dayKey) return false
  // Only if today is already marked.
  if (!data.days.includes(dayKey)) return false
  data.days.push(yesterday)
  data.days.sort()
  data.makeupUsedOn = dayKey
  save(data)
  return true
}

export function exportStreakSummary(): {
  streak: number
  days: string[]
} {
  return { streak: getCurrentStreak(), days: load().days }
}
