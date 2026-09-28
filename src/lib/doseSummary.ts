/**
 * Weekly dose aggregation for parents/clinicians.
 * Clinical dosing is measured in on-task time per week; we sum real session
 * active minutes (durationMs), count training days, and split out the
 * binocular / anti-suppression share (the evidence-backed active ingredient).
 */

import { getGameDef, type GameId } from './gameCatalog'
import { localDayKey } from '../store/trainingTimerStore'
import type { TrainingSession } from './trainingTypes'

/** Recommended training days per week (dosing/adherence heuristic). */
export const WEEKLY_TRAINING_DAYS_TARGET = 6

/** Foci that require/train both eyes together — the "active ingredient". */
const BINOCULAR_FOCI = new Set(['anti-suppression', 'stereo', 'vergence'])

/** Minimum healthy binocular share of weekly on-task time. */
export const BINOCULAR_SHARE_TARGET_PCT = 50

export interface WeeklyDose {
  /** On-task minutes this week (sum of session active time). */
  onTaskMin: number
  /** Weekly on-task target minutes (daily target × recommended days). */
  targetMin: number
  /** Distinct calendar days trained this week. */
  daysTrained: number
  /** Binocular/anti-suppression on-task minutes this week. */
  binocularMin: number
  /** Binocular share of weekly on-task time, 0–100. */
  binocularPct: number
}

/** Monday 00:00 (local) of the week containing `now`. */
function startOfWeek(now = new Date()): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const mondayOffset = (d.getDay() + 6) % 7 // Sun=0 → 6, Mon=1 → 0
  d.setDate(d.getDate() - mondayOffset)
  return d.getTime()
}

/**
 * Aggregate this week's on-task dose from stored sessions.
 * @param dailyTargetMs daily effective-minute target (from getETargetMs()).
 */
export function computeWeeklyDose(
  sessions: TrainingSession[],
  dailyTargetMs: number,
  now = new Date(),
): WeeklyDose {
  const weekStart = startOfWeek(now)
  const days = new Set<string>()
  let onTaskMs = 0
  let binocularMs = 0

  for (const s of sessions) {
    const t = Date.parse(s.startedAt)
    if (!Number.isFinite(t) || t < weekStart) continue
    onTaskMs += s.durationMs
    days.add(localDayKey(new Date(t)))
    const focus = getGameDef(s.module as GameId)?.focus
    if (focus && BINOCULAR_FOCI.has(focus)) binocularMs += s.durationMs
  }

  const targetMin = Math.round(
    (dailyTargetMs / 60000) * WEEKLY_TRAINING_DAYS_TARGET,
  )
  return {
    onTaskMin: Math.round(onTaskMs / 60000),
    targetMin,
    daysTrained: days.size,
    binocularMin: Math.round(binocularMs / 60000),
    binocularPct: onTaskMs > 0 ? Math.round((binocularMs / onTaskMs) * 100) : 0,
  }
}
