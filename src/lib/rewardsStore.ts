/**
 * Milestone sticker rewards for adherence (local-only).
 * Streak-day thresholds unlock collectible stickers shown on the kid home.
 */

const STORAGE_KEY = 'vision_rewards'
const NEW_STICKER_KEY = 'vision_new_sticker'

export interface StickerDef {
  /** Streak days required to unlock. */
  days: number
  emoji: string
  name: string
}

/** Ordered milestone catalog. */
export const STICKERS: StickerDef[] = [
  { days: 3, emoji: '🌱', name: '小芽章' },
  { days: 7, emoji: '⭐', name: '一周星' },
  { days: 14, emoji: '🏅', name: '半月奖牌' },
  { days: 30, emoji: '👑', name: '满月皇冠' },
]

interface RewardsFile {
  /** Unlocked sticker thresholds (days values). */
  earned: number[]
}

function load(): RewardsFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { earned: [] }
    const parsed = JSON.parse(raw) as RewardsFile
    return { earned: Array.isArray(parsed.earned) ? parsed.earned : [] }
  } catch {
    return { earned: [] }
  }
}

function save(data: RewardsFile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

/** Whether a milestone (by day threshold) has been earned. */
export function isStickerEarned(days: number): boolean {
  return load().earned.includes(days)
}

/** All sticker defs paired with earned state, in catalog order. */
export function getStickerShelf(): (StickerDef & { earned: boolean })[] {
  const earned = new Set(load().earned)
  return STICKERS.map((s) => ({ ...s, earned: earned.has(s.days) }))
}

/**
 * Unlock any stickers whose threshold ≤ current streak. Returns newly unlocked
 * defs (empty when nothing changed) and stashes the latest for a one-time toast.
 */
export function syncRewards(streakDays: number): StickerDef[] {
  const data = load()
  const earned = new Set(data.earned)
  const fresh: StickerDef[] = []
  for (const s of STICKERS) {
    if (streakDays >= s.days && !earned.has(s.days)) {
      earned.add(s.days)
      fresh.push(s)
    }
  }
  if (fresh.length > 0) {
    data.earned = [...earned].sort((a, b) => a - b)
    save(data)
    try {
      // Stash the highest new milestone for the home celebration.
      const top = fresh[fresh.length - 1]
      localStorage.setItem(NEW_STICKER_KEY, JSON.stringify(top))
    } catch {
      // ignore persistence errors
    }
  }
  return fresh
}

/** Read and clear the pending new-sticker celebration (consume once). */
export function takeNewSticker(): StickerDef | null {
  try {
    const raw = localStorage.getItem(NEW_STICKER_KEY)
    if (!raw) return null
    localStorage.removeItem(NEW_STICKER_KEY)
    const s = JSON.parse(raw) as StickerDef
    if (typeof s?.days === 'number' && typeof s?.emoji === 'string') return s
    return null
  } catch {
    return null
  }
}
