/** Catalog of therapy mini-games + hospital-style multi-day rotation. */

export type GameId =
  | 'gabor'
  | 'dichoptic'
  | 'pursuit'
  | 'starPop'
  | 'orient'
  | 'memory'
  | 'fixate'
  | 'bubbleRush'
  | 'saccadeJump'
  | 'stereoNear'
  | 'contrastBalance'
  | 'vergenceJump'

export type GameFocus =
  | 'acuity'
  | 'anti-suppression'
  | 'pursuit'
  | 'fusion'
  | 'reaction'
  | 'memory'
  | 'saccade'
  | 'stereo'
  | 'vergence'

export interface GameDef {
  id: GameId
  title: string
  /** Compact 2-char label for kid home chips (avoids slice collisions). */
  abbr: string
  short: string
  focus: GameFocus
  needsGlasses: boolean
  tone: string
  minutesHint: string
}

/** Emoji per training focus — quick visual grouping on kid home chips. */
export function focusEmoji(focus: GameFocus): string {
  switch (focus) {
    case 'acuity':
      return '🔍'
    case 'anti-suppression':
      return '👓'
    case 'pursuit':
      return '🦋'
    case 'fusion':
      return '🎯'
    case 'reaction':
      return '⚡'
    case 'memory':
      return '🧠'
    case 'saccade':
      return '💡'
    case 'stereo':
      return '🧊'
    case 'vergence':
      return '🔭'
    default:
      return '⭐'
  }
}

/** Full pool — hospital apps typically draw 4–6 from a larger library. */
export const GAME_CATALOG: GameDef[] = [
  {
    id: 'gabor',
    title: 'Gabor 找斑点',
    abbr: '找斑',
    short: '噪点里找出条纹斑，练空间分辨力',
    focus: 'acuity',
    needsGlasses: false,
    tone: 'from-sky-100 to-cyan-50',
    minutesHint: '3–5 分钟',
  },
  {
    id: 'dichoptic',
    title: '红蓝小熊冒险',
    abbr: '小熊',
    short: '一眼赛道金币，一眼角色障碍',
    focus: 'anti-suppression',
    needsGlasses: true,
    tone: 'from-rose-100 to-orange-50',
    minutesHint: '3–5 分钟',
  },
  {
    id: 'pursuit',
    title: '追蝴蝶',
    abbr: '追蝶',
    short: '手指跟着飞舞的目标，练追随运动',
    focus: 'pursuit',
    needsGlasses: false,
    tone: 'from-emerald-100 to-teal-50',
    minutesHint: '2–4 分钟',
  },
  {
    id: 'starPop',
    title: '戳红星',
    abbr: '红星',
    short: '只戳红色星星，躲开蓝色干扰（需眼镜）',
    focus: 'anti-suppression',
    needsGlasses: true,
    tone: 'from-amber-100 to-yellow-50',
    minutesHint: '2–4 分钟',
  },
  {
    id: 'orient',
    title: '小鱼朝哪边',
    abbr: '小鱼',
    short: '看清小鱼朝向，点对应方向',
    focus: 'acuity',
    needsGlasses: false,
    tone: 'from-cyan-100 to-sky-50',
    minutesHint: '2–3 分钟',
  },
  {
    id: 'memory',
    title: '红蓝翻翻乐',
    abbr: '翻翻',
    short: '红蓝配对记忆，双眼都要看见',
    focus: 'anti-suppression',
    needsGlasses: true,
    tone: 'from-lime-100 to-emerald-50',
    minutesHint: '3–4 分钟',
  },
  {
    id: 'fixate',
    title: '盯住小光点',
    abbr: '盯点',
    short: '光点停下时立刻点中，练注视稳定',
    focus: 'fusion',
    needsGlasses: false,
    tone: 'from-orange-100 to-amber-50',
    minutesHint: '2–3 分钟',
  },
  {
    id: 'bubbleRush',
    title: '泡泡冲冲冲',
    abbr: '泡泡',
    short: '四周冒泡泡，又快又准地点破',
    focus: 'reaction',
    needsGlasses: false,
    tone: 'from-teal-100 to-cyan-50',
    minutesHint: '2–3 分钟',
  },
  {
    id: 'saccadeJump',
    title: '灯光跳跳',
    abbr: '跳灯',
    short: '亮灯跳到哪格就点哪格，练眼球扫视',
    focus: 'saccade',
    needsGlasses: false,
    tone: 'from-violet-100 to-fuchsia-50',
    minutesHint: '2–4 分钟',
  },
  {
    id: 'stereoNear',
    title: '谁更近',
    abbr: '谁近',
    short: '戴眼镜看谁更近，练立体深度',
    focus: 'stereo',
    needsGlasses: true,
    tone: 'from-indigo-100 to-sky-50',
    minutesHint: '2–4 分钟',
  },
  {
    id: 'contrastBalance',
    title: '红蓝天平',
    abbr: '天平',
    short: '弱视眼找宝藏，健眼干扰变淡，练抗抑制',
    focus: 'anti-suppression',
    needsGlasses: true,
    tone: 'from-pink-100 to-rose-50',
    minutesHint: '3–5 分钟',
  },
  {
    id: 'vergenceJump',
    title: '近远跳跳',
    abbr: '近远',
    short: '近景大框和远景小框之间跳着点，练集合散',
    focus: 'vergence',
    needsGlasses: false,
    tone: 'from-fuchsia-100 to-violet-50',
    minutesHint: '2–4 分钟',
  },
]

/** How many calendar days a playlist stays before reshuffling. */
export const ROTATION_PERIOD_DAYS = 3

/** Daily assignment size range (inclusive), matching hospital apps. */
export const DAILY_COUNT_MIN = 4
export const DAILY_COUNT_MAX = 6

/**
 * Mulberry32 — tiny deterministic PRNG for stable rotations.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Period index: floors UTC midnight epochs into ROTATION_PERIOD_DAYS buckets.
 */
export function getRotationPeriodIndex(
  date = new Date(),
  periodDays = ROTATION_PERIOD_DAYS,
): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.floor(utc / (periodDays * 86_400_000))
}

/**
 * Days remaining in the current rotation window (1 … periodDays).
 */
export function daysLeftInRotation(
  date = new Date(),
  periodDays = ROTATION_PERIOD_DAYS,
): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const dayIndex = Math.floor(utc / 86_400_000)
  const consumed = dayIndex % periodDays
  return periodDays - consumed
}

/**
 * Fisher–Yates shuffle with injected RNG.
 */
export function shuffleWith<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export interface DailyPlaylist {
  periodIndex: number
  daysLeft: number
  periodDays: number
  games: GameDef[]
}

/**
 * Pick 4–6 games for the current multi-day rotation (stable within the window).
 * Guarantees ≥1 acuity + ≥1 anti-suppression for a balanced therapy mix.
 */
export function getDailyPlaylist(date = new Date()): DailyPlaylist {
  const periodIndex = getRotationPeriodIndex(date)
  const rng = mulberry32(periodIndex ^ 0x71e1_0a7e)
  const span = DAILY_COUNT_MAX - DAILY_COUNT_MIN + 1
  const count = DAILY_COUNT_MIN + Math.floor(rng() * span)

  const acuityPool = GAME_CATALOG.filter((g) => g.focus === 'acuity')
  const dichopticPool = GAME_CATALOG.filter((g) => g.focus === 'anti-suppression')
  const otherPool = GAME_CATALOG.filter(
    (g) => g.focus !== 'acuity' && g.focus !== 'anti-suppression',
  )

  const pick = (pool: GameDef[]) =>
    shuffleWith(pool, rng)[0] ?? GAME_CATALOG[0]

  const mustHave = [pick(acuityPool), pick(dichopticPool)]
  const used = new Set(mustHave.map((g) => g.id))
  const rest = shuffleWith(
    [...acuityPool, ...dichopticPool, ...otherPool].filter(
      (g) => !used.has(g.id),
    ),
    rng,
  )
  const games = [...mustHave, ...rest].slice(0, count)

  return {
    periodIndex,
    daysLeft: daysLeftInRotation(date),
    periodDays: ROTATION_PERIOD_DAYS,
    games,
  }
}

export function getGameDef(id: GameId): GameDef | undefined {
  return GAME_CATALOG.find((g) => g.id === id)
}

export function gameTitle(id: string): string {
  return getGameDef(id as GameId)?.title ?? id
}
