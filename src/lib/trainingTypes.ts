/** Clinical / engagement extras on top of base session rows. */

import type { GameId } from './gameCatalog'

export type TrainingModule = GameId

/** Optional clinician-facing metrics attached to a session. */
export interface ClinicalMetrics {
  /** Gabor: final staircase contrast (0–1). */
  finalContrast?: number
  /** Gabor: final spatial frequency (cycles/px). */
  finalSpatialFrequency?: number
  /** Gabor: staircase step / reversal proxy count. */
  reversalCount?: number
  /** Gabor: number of completed trials. */
  trialCount?: number
  /** Dichoptic: red-channel successful interactions (coins etc.). */
  redHits?: number
  /** Dichoptic: blue-channel collision / hazard count. */
  blueCollisions?: number
  /**
   * Binocular Cooperation Index 0–100:
   * red-channel effective share × completion/accuracy proxy.
   */
  bci?: number
  /** Whether the child was instructed to wear anaglyph glasses. */
  woreGlasses?: boolean
  /** Whether dichoptic calibration was fresh at session start. */
  calibrated?: boolean
  /** Playlist rotation period index when the session ran. */
  playlistPeriod?: number
  /** Behavior-based focus average 0–100 for the session. */
  focusAvg?: number
  /** StereoNear: final disparity in CSS pixels (smaller = harder). */
  finalDisparityPx?: number
  /** SaccadeJump: mean reaction time ms. */
  meanSaccadeRtMs?: number
  /** ContrastBalance: fellow-eye contrast 0–1 (lower = more balance challenge). */
  fellowContrast?: number
  /** ContrastBalance: which channel is treated as amblyopic eye. */
  amblyopicEye?: 'red' | 'blue'
  /** Fixate: mean catch reaction time while paused (ms). */
  meanCatchRtMs?: number
  /** VergenceJump: mean reaction time on near/far targets (ms). */
  meanVergenceRtMs?: number
}

export interface TrainingSession {
  id?: number
  /** Stable cross-device id for cloud sync dedupe (UUID). */
  syncId?: string
  /** Originating device id (for provenance / debugging). */
  deviceId?: string
  module: TrainingModule
  /** ISO timestamp when the session started. */
  startedAt: string
  /** ISO timestamp when the session ended. */
  endedAt: string
  /** Active training duration in milliseconds (excludes pause/break). */
  durationMs: number
  /** Hit rate 0–100. */
  accuracy: number
  /** Average reaction time in ms; null when not applicable. */
  avgReactionMs: number | null
  /** Extra score-like metric (hits, coins, etc.). */
  score: number
  notes?: string
  /** Optional clinical payload for parent/doctor charts. */
  clinical?: ClinicalMetrics
}

/** Default wall-clock cap — keep in sync with focusScore.WALL_HARD_CAP_MS.
 * Runtime cap is parent-configurable via focusScore.getWallCapMs(). */
export const TRAINING_LIMIT_MS = 30 * 60 * 1000
export const BREAK_DURATION_MS = 3 * 60 * 1000

/** 20-20-20 micro-break: gentle far-look reminder cadence + duration. */
export const MICRO_BREAK_INTERVAL_MS = 12 * 60 * 1000
export const MICRO_BREAK_SECONDS = 20

/**
 * Derive BCI from red/blue dichoptic counts and overall accuracy.
 * Higher = more effective red-channel (amblyopic-eye) engagement with decent accuracy.
 */
export function computeBci(
  redHits: number,
  blueCollisions: number,
  accuracyPct: number,
): number {
  const total = redHits + blueCollisions
  if (total <= 0) return 0
  const redShare = redHits / total
  const acc = Math.min(1, Math.max(0, accuracyPct / 100))
  return Math.round(redShare * acc * 100)
}
