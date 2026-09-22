/**
 * Per-child ability profile — transparent adaptive offsets exportable for clinicians.
 * Consecutive strong sessions nudge start difficulty up; weak sessions ease it.
 */

import type { GameId } from './gameCatalog'

const STORAGE_KEY = 'vision_ability_profile'

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
  return next
}

/**
 * Map ability level to a gentle Gabor contrast start multiplier.
 * level −2 → easier (higher contrast), +2 → harder (lower contrast).
 */
export function gaborStartContrastForLevel(baseContrast: number, level: number): number {
  const factor = 1 - level * 0.08
  return Math.min(1, Math.max(0.25, baseContrast * factor))
}
