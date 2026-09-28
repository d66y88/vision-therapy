/**
 * Per-child ability profile — transparent adaptive offsets exportable for clinicians.
 * Consecutive strong sessions nudge start difficulty up; weak sessions ease it.
 */

import type { GameId } from './gameCatalog'

const STORAGE_KEY = 'vision_ability_profile'
const LEVELUP_KEY = 'vision_last_levelup'

export interface GameAbility {
  /** Relative start difficulty: −2 easy … +2 hard. */
  level: number
  /** Rolling streak of “good” sessions (accuracy ≥ 70%). */
  winStreak: number
  /** Rolling streak of “weak” sessions (accuracy < 45%). */
  loseStreak: number
  updatedAt: string
}

export type AbilityProfile = Partial<Record<GameId, GameAbility>>

function clampLevel(n: number): number {
  return Math.max(-2, Math.min(2, Math.round(n)))
}

export function loadAbilityProfile(): AbilityProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as AbilityProfile
  } catch {
    return {}
  }
}

export function saveAbilityProfile(profile: AbilityProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}

export function getGameAbility(id: GameId): GameAbility {
  const p = loadAbilityProfile()
  return (
    p[id] ?? {
      level: 0,
      winStreak: 0,
      loseStreak: 0,
      updatedAt: new Date(0).toISOString(),
    }
  )
}

/**
 * Update ability after a completed session. Transparent AmblyoPlay-style adaptation.
 */
export function recordAbilityOutcome(id: GameId, accuracyPct: number): GameAbility {
  const profile = loadAbilityProfile()
  const cur = getGameAbility(id)
  let { level, winStreak, loseStreak } = cur

  if (accuracyPct >= 70) {
    winStreak += 1
    loseStreak = 0
    if (winStreak >= 3) {
      level = clampLevel(level + 1)
      winStreak = 0
    }
  } else if (accuracyPct < 45) {
    loseStreak += 1
    winStreak = 0
    if (loseStreak >= 2) {
      level = clampLevel(level - 1)
      loseStreak = 0
    }
  } else {
    winStreak = 0
    loseStreak = 0
  }

  const next: GameAbility = {
    level,
    winStreak,
    loseStreak,
    updatedAt: new Date().toISOString(),
  }
  profile[id] = next
  saveAbilityProfile(profile)
  if (level > cur.level) {
    recordLevelUp(id, level)
  }
  return next
}

export interface LevelUpEvent {
  id: GameId
  level: number
  at: string
}

/** Stash the most recent difficulty increase for a one-time home celebration. */
function recordLevelUp(id: GameId, level: number): void {
  try {
    const evt: LevelUpEvent = { id, level, at: new Date().toISOString() }
    localStorage.setItem(LEVELUP_KEY, JSON.stringify(evt))
  } catch {
    // ignore persistence errors
  }
}

/** Read and clear the pending level-up event (consume once). */
export function takeRecentLevelUp(): LevelUpEvent | null {
  try {
    const raw = localStorage.getItem(LEVELUP_KEY)
    if (!raw) return null
    localStorage.removeItem(LEVELUP_KEY)
    const evt = JSON.parse(raw) as LevelUpEvent
    if (typeof evt?.id === 'string' && typeof evt?.level === 'number') {
      return evt
    }
    return null
  } catch {
    return null
  }
}

/** Human label for an ability level (kid + parent facing). */
export function levelLabel(level: number): string {
  if (level >= 1) return '挑战级'
  if (level <= -1) return '入门级'
  return '进阶级'
}

/** Tailwind color classes for a level chip. */
export function levelTone(level: number): string {
  if (level >= 1) return 'bg-fuchsia-100 text-fuchsia-700'
  if (level <= -1) return 'bg-sky-100 text-sky-700'
  return 'bg-amber-100 text-amber-700'
}

/**
 * Map ability level to a gentle Gabor contrast start multiplier.
 * level −2 → easier (higher contrast), +2 → harder (lower contrast).
 */
export function gaborStartContrastForLevel(baseContrast: number, level: number): number {
  const factor = 1 - level * 0.08
  return Math.min(1, Math.max(0.25, baseContrast * factor))
}

/** Orient fish start size: higher level → smaller (harder). */
export function orientStartSizeForLevel(level: number): number {
  return Math.round(Math.min(120, Math.max(52, 96 - level * 10)))
}

/** Pursuit path speed multiplier. */
export function pursuitSpeedForLevel(level: number): number {
  return Math.min(1.45, Math.max(0.7, 1 + level * 0.12))
}

/** Saccade grid: 3×3 at easy, 4×4 at hard. */
export function saccadeGridForLevel(level: number): 3 | 4 {
  return level >= 1 ? 4 : 3
}

/** Stereo starting disparity in px (larger = easier). */
export function stereoStartDisparityForLevel(level: number): number {
  return Math.round(Math.min(48, Math.max(10, 28 - level * 5)))
}

/** ContrastBalance fellow-eye start contrast (lower = harder). */
export function fellowContrastForLevel(level: number): number {
  return Math.min(0.95, Math.max(0.35, 0.78 - level * 0.08))
}

/** Fixate pause window ms (shorter = harder). */
export function fixatePauseMsForLevel(level: number): number {
  return Math.round(Math.min(1800, Math.max(900, 1400 - level * 120)))
}

/** Fixate travel speed px/s (faster = harder). */
export function fixateSpeedForLevel(level: number): number {
  return Math.min(85, Math.max(40, 55 + level * 8))
}

/** BubbleRush spawn gap ms (lower = harder). */
export function bubbleSpawnGapForLevel(level: number): number {
  return Math.round(Math.min(1100, Math.max(420, 800 - level * 90)))
}

/** BubbleRush TTL base ms (lower = harder). */
export function bubbleTtlForLevel(level: number): number {
  return Math.round(Math.min(3000, Math.max(1500, 2400 - level * 180)))
}

/** Memory pair count: 4 / 6 / 8 by ability. */
export function memoryPairsForLevel(level: number): 4 | 6 | 8 {
  if (level <= -1) return 4
  if (level >= 1) return 8
  return 6
}

/** StarPop red-bias start (slightly more red at easy). */
export function starPopRedBiasForLevel(level: number): number {
  return Math.min(0.78, Math.max(0.48, 0.62 - level * 0.04))
}

/** StarPop spawn gap ms. */
export function starPopSpawnGapForLevel(level: number): number {
  return Math.round(Math.min(1300, Math.max(520, 1000 - level * 90)))
}

/** Dichoptic scroll speed multiplier. */
export function dichopticSpeedForLevel(level: number): number {
  return Math.min(1.5, Math.max(0.75, 1 + level * 0.12))
}

/** Dichoptic obstacle spawn interval ms (lower = harder). */
export function dichopticObsSpawnMsForLevel(level: number): number {
  return Math.round(Math.min(2800, Math.max(1400, 2200 - level * 180)))
}

/** VergenceJump cue window ms (shorter = harder). */
export function vergenceCueMsForLevel(level: number): number {
  return Math.round(Math.min(2600, Math.max(1100, 2000 - level * 200)))
}
