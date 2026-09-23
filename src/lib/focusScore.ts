/**
 * Behavior-based focus scoring → effective training minutes.
 * focusScore ∈ [0.7, 1.25]: distracted discounts, focused boosts wall-clock accrual.
 */

export const FOCUS_SCORE_MIN = 0.7
export const FOCUS_SCORE_MAX = 1.25
/** Default effective-minute target for daily check-in (18 min). */
export const DEFAULT_E_TARGET_MS = 18 * 60 * 1000
/** Wall-clock hard cap (30 min) — never exceeded. */
export const WALL_HARD_CAP_MS = 30 * 60 * 1000

const E_TARGET_KEY = 'vision_e_target_ms'
/** Parent-selectable check-in targets (minutes → ms). */
export const ALLOWED_E_TARGETS_MIN = [15, 18, 20, 25] as const
const ALLOWED_TARGETS = ALLOWED_E_TARGETS_MIN.map((m) => m * 60 * 1000)

export function getETargetMs(): number {
  try {
    const raw = Number(localStorage.getItem(E_TARGET_KEY))
    if (ALLOWED_TARGETS.includes(raw)) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_E_TARGET_MS
}

export function setETargetMs(ms: number): void {
  const next = ALLOWED_TARGETS.includes(ms) ? ms : DEFAULT_E_TARGET_MS
  localStorage.setItem(E_TARGET_KEY, String(next))
}

export function clampFocusScore(n: number): number {
  return Math.min(FOCUS_SCORE_MAX, Math.max(FOCUS_SCORE_MIN, n))
}

/** Shared posture signal from DistanceGuard → FocusTracker. */
let globalPostureOk = true

export function setGlobalPostureOk(ok: boolean): void {
  globalPostureOk = ok
}

export function getGlobalPostureOk(): boolean {
  return globalPostureOk
}

/**
 * Rolling focus tracker for one active game session.
 */
export class FocusTracker {
  private outcomes: Array<'hit' | 'miss'> = []
  private lastInteractAt = Date.now()
  private postureOk = true
  private samples: number[] = []

  reportInteract(now = Date.now()): void {
    this.lastInteractAt = now
  }

  reportTrial(outcome: 'hit' | 'miss', now = Date.now()): void {
    this.outcomes.push(outcome)
    if (this.outcomes.length > 10) this.outcomes.shift()
    this.reportInteract(now)
  }

  /** Face/distance guard: false when too close or face missing. */
  setPostureOk(ok: boolean): void {
    this.postureOk = ok
  }

  /**
   * Current multiplier for effective-ms accrual.
   */
  score(now = Date.now()): number {
    let s = 1

    const idleMs = now - this.lastInteractAt
    if (idleMs > 12_000) s -= 0.25
    else if (idleMs > 8_000) s -= 0.15

    if (this.outcomes.length >= 3) {
      const hits = this.outcomes.filter((o) => o === 'hit').length
      const rate = hits / this.outcomes.length
      if (rate >= 0.7) s += 0.15
      else if (rate < 0.4) s -= 0.2
    }

    if (!this.postureOk || !globalPostureOk) s -= 0.15

    const clamped = clampFocusScore(s)
    this.samples.push(clamped)
    if (this.samples.length > 120) this.samples.shift()
    return clamped
  }

  /** Session average mapped to 0–100 for clinical export. */
  avgFocusPct(): number {
    if (this.samples.length === 0) return 70
    const avg =
      this.samples.reduce((a, b) => a + b, 0) / this.samples.length
    const norm =
      (avg - FOCUS_SCORE_MIN) / (FOCUS_SCORE_MAX - FOCUS_SCORE_MIN)
    return Math.round(Math.min(100, Math.max(0, norm * 100)))
  }

  reset(): void {
    this.outcomes = []
    this.lastInteractAt = Date.now()
    this.postureOk = true
    this.samples = []
  }
}

/** Kid-facing one-liner for dose / check-in state. */
export function kidDoseMessage(opts: {
  effectiveMs: number
  eTargetMs: number
  playlistDone: boolean
  wallExhausted: boolean
}): string {
  const { effectiveMs, eTargetMs, playlistDone, wallExhausted } = opts
  const eOk = effectiveMs >= eTargetMs
  if (eOk && playlistDone) return '今日打卡完成！做得真棒'
  if (eOk && !playlistDone) return '时间够了，把课表练完就能打卡'
  if (!eOk && playlistDone) return '课表完成啦，再专心练一会儿'
  if (wallExhausted) return '今日训练已满，明天再来'
  return '专心练 · 还能早点打卡'
}

export function focusSentence(focusAvg: number | undefined): string {
  if (focusAvg == null) {
    return '练完几关后，这里会显示今天的专心程度。'
  }
  if (focusAvg >= 75) {
    return `今天练得很专心（专注 ${focusAvg}），坐姿时间可以更短也能打卡。`
  }
  if (focusAvg >= 50) {
    return `今天专注还不错（专注 ${focusAvg}），继续保持均匀点击。`
  }
  return `今天有点分心（专注 ${focusAvg}），多互动、坐远一点，有效时间会攒得更快。`
}
