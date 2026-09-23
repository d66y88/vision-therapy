import { create } from 'zustand'
import {
  DEFAULT_E_TARGET_MS,
  getETargetMs,
  type FocusTracker,
} from '../lib/focusScore'
import {
  BREAK_DURATION_MS,
  TRAINING_LIMIT_MS,
} from '../lib/trainingTypes'

type TimerPhase = 'idle' | 'training' | 'locked'

interface TrainingTimerState {
  phase: TimerPhase
  /** Accumulated active wall-clock ms (paused segments already folded in). */
  elapsedMs: number
  /** Focus-weighted effective ms for check-in (E). */
  effectiveMs: number
  /** Live focus multiplier while training. */
  focusScore: number
  /** YYYY-MM-DD of the quota day (local). */
  dayKey: string
  /** When phase === training, wall-clock start of the active segment. */
  segmentStartedAt: number | null
  /** Last time effectiveMs was accrued from the live segment. */
  lastAccrueAt: number | null
  /** When phase === locked, absolute Date.now() when break ends. */
  breakEndsAt: number | null
  startTraining: () => boolean
  pauseTraining: () => void
  /** Push live focus score from FocusTracker (while training). */
  setFocusScore: (score: number) => void
  /** Advance phase transitions; return whether interaction is allowed. */
  tick: (now?: number) => boolean
  canInteract: () => boolean
  resetDay: () => void
}

const STORAGE_KEY = 'vision_training_timer'

interface PersistedTimer {
  phase: TimerPhase
  elapsedMs: number
  effectiveMs: number
  breakEndsAt: number | null
  dayKey: string
  savedAt: number
}

/** Local calendar day key for daily quota reset. */
export function localDayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = `${now.getMonth() + 1}`.padStart(2, '0')
  const d = `${now.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

function loadPersisted(): PersistedTimer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedTimer
  } catch {
    return null
  }
}

function persist(partial: {
  phase: TimerPhase
  elapsedMs: number
  effectiveMs: number
  breakEndsAt: number | null
  dayKey: string
}): void {
  const payload: PersistedTimer = { ...partial, savedAt: Date.now() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

function hydrate(): Pick<
  TrainingTimerState,
  | 'phase'
  | 'elapsedMs'
  | 'effectiveMs'
  | 'focusScore'
  | 'segmentStartedAt'
  | 'lastAccrueAt'
  | 'breakEndsAt'
  | 'dayKey'
> {
  const today = localDayKey()
  const saved = loadPersisted()
  if (!saved || saved.dayKey !== today) {
    return {
      phase: 'idle',
      elapsedMs: 0,
      effectiveMs: 0,
      focusScore: 1,
      dayKey: today,
      segmentStartedAt: null,
      lastAccrueAt: null,
      breakEndsAt: null,
    }
  }

  const effectiveMs = Math.max(0, saved.effectiveMs ?? 0)

  if (saved.phase === 'locked' && saved.breakEndsAt != null) {
    if (Date.now() >= saved.breakEndsAt) {
      return {
        phase: 'idle',
        elapsedMs: TRAINING_LIMIT_MS,
        effectiveMs,
        focusScore: 1,
        dayKey: today,
        segmentStartedAt: null,
        lastAccrueAt: null,
        breakEndsAt: null,
      }
    }
    return {
      phase: 'locked',
      elapsedMs: TRAINING_LIMIT_MS,
      effectiveMs,
      focusScore: 1,
      dayKey: today,
      segmentStartedAt: null,
      lastAccrueAt: null,
      breakEndsAt: saved.breakEndsAt,
    }
  }

  // Never resume mid-flight after reload — only count time while a game session
  // is actively running. Rewrite storage if a prior crash left phase=training.
  const idle = {
    phase: 'idle' as const,
    elapsedMs: Math.min(saved.elapsedMs, TRAINING_LIMIT_MS),
    effectiveMs,
    focusScore: 1,
    dayKey: today,
    segmentStartedAt: null,
    lastAccrueAt: null,
    breakEndsAt: null,
  }
  if (saved.phase === 'training') {
    persist({
      phase: 'idle',
      elapsedMs: idle.elapsedMs,
      effectiveMs,
      breakEndsAt: null,
      dayKey: today,
    })
  }
  return idle
}

function lockNow(
  elapsedMs: number,
  effectiveMs: number,
  dayKey: string,
): {
  phase: TimerPhase
  elapsedMs: number
  effectiveMs: number
  segmentStartedAt: null
  lastAccrueAt: null
  breakEndsAt: number
  dayKey: string
} {
  const breakEndsAt = Date.now() + BREAK_DURATION_MS
  persist({
    phase: 'locked',
    elapsedMs: TRAINING_LIMIT_MS,
    effectiveMs,
    breakEndsAt,
    dayKey,
  })
  return {
    phase: 'locked',
    elapsedMs: Math.max(elapsedMs, TRAINING_LIMIT_MS),
    effectiveMs,
    segmentStartedAt: null,
    lastAccrueAt: null,
    breakEndsAt,
    dayKey,
  }
}

function ensureToday(
  state: Pick<
    TrainingTimerState,
    | 'phase'
    | 'elapsedMs'
    | 'effectiveMs'
    | 'dayKey'
    | 'breakEndsAt'
    | 'segmentStartedAt'
    | 'lastAccrueAt'
  >,
): Pick<
  TrainingTimerState,
  | 'phase'
  | 'elapsedMs'
  | 'effectiveMs'
  | 'dayKey'
  | 'breakEndsAt'
  | 'segmentStartedAt'
  | 'lastAccrueAt'
> {
  const today = localDayKey()
  if (state.dayKey === today) return state
  const fresh = {
    phase: 'idle' as const,
    elapsedMs: 0,
    effectiveMs: 0,
    dayKey: today,
    segmentStartedAt: null,
    lastAccrueAt: null,
    breakEndsAt: null,
  }
  persist(fresh)
  return fresh
}

/** Accrue wall + effective for the live training segment up to `now`. */
function accrualDelta(
  state: TrainingTimerState,
  now: number,
): { wallDelta: number; effDelta: number; lastAccrueAt: number } | null {
  if (state.phase !== 'training' || state.segmentStartedAt == null) return null
  const from = state.lastAccrueAt ?? state.segmentStartedAt
  const wallDelta = Math.max(0, now - from)
  if (wallDelta <= 0) return null
  const effDelta = wallDelta * state.focusScore
  return { wallDelta, effDelta, lastAccrueAt: now }
}

export const useTrainingTimerStore = create<TrainingTimerState>((set, get) => ({
  ...hydrate(),

  startTraining: () => {
    const rolled = ensureToday(get())
    if (
      rolled.dayKey !== get().dayKey ||
      rolled.elapsedMs !== get().elapsedMs ||
      rolled.effectiveMs !== get().effectiveMs
    ) {
      set(rolled)
    }

    get().tick()
    const latest = get()
    if (latest.phase === 'locked') return false
    if (latest.elapsedMs >= TRAINING_LIMIT_MS) return false

    if (latest.phase === 'training' && latest.segmentStartedAt != null) {
      return true
    }

    const now = Date.now()
    set({
      phase: 'training',
      segmentStartedAt: now,
      lastAccrueAt: now,
      focusScore: 1,
    })
    persist({
      phase: 'training',
      elapsedMs: latest.elapsedMs,
      effectiveMs: latest.effectiveMs,
      breakEndsAt: null,
      dayKey: latest.dayKey,
    })
    return true
  },

  pauseTraining: () => {
    const state = ensureToday(get())
    if (state.dayKey !== get().dayKey) set(state)

    const current = get()
    if (current.phase !== 'training' || current.segmentStartedAt == null) {
      set({
        phase: current.phase === 'locked' ? 'locked' : 'idle',
        segmentStartedAt: null,
        lastAccrueAt: null,
      })
      return
    }

    const now = Date.now()
    const delta = accrualDelta(current, now)
    const elapsedMs = Math.min(
      TRAINING_LIMIT_MS,
      current.elapsedMs + (delta?.wallDelta ?? 0),
    )
    const effectiveMs = current.effectiveMs + (delta?.effDelta ?? 0)

    if (elapsedMs >= TRAINING_LIMIT_MS) {
      set(lockNow(elapsedMs, effectiveMs, current.dayKey))
      return
    }
    set({
      phase: 'idle',
      elapsedMs,
      effectiveMs,
      segmentStartedAt: null,
      lastAccrueAt: null,
    })
    persist({
      phase: 'idle',
      elapsedMs,
      effectiveMs,
      breakEndsAt: null,
      dayKey: current.dayKey,
    })
  },

  setFocusScore: (score: number) => {
    const now = Date.now()
    const current = get()
    if (current.phase === 'training' && current.segmentStartedAt != null) {
      const delta = accrualDelta(current, now)
      if (delta) {
        set({
          elapsedMs: Math.min(
            TRAINING_LIMIT_MS,
            current.elapsedMs + delta.wallDelta,
          ),
          effectiveMs: current.effectiveMs + delta.effDelta,
          lastAccrueAt: delta.lastAccrueAt,
          focusScore: score,
          segmentStartedAt: current.segmentStartedAt,
        })
        return
      }
    }
    set({ focusScore: score })
  },

  tick: (now = Date.now()) => {
    const rolled = ensureToday(get())
    if (rolled.dayKey !== get().dayKey) set(rolled)

    const state = get()

    if (state.phase === 'locked') {
      if (state.breakEndsAt != null && now >= state.breakEndsAt) {
        const dayKey = localDayKey(new Date(now))
        set({
          phase: 'idle',
          elapsedMs: TRAINING_LIMIT_MS,
          effectiveMs: state.effectiveMs,
          segmentStartedAt: null,
          lastAccrueAt: null,
          breakEndsAt: null,
          dayKey,
        })
        persist({
          phase: 'idle',
          elapsedMs: TRAINING_LIMIT_MS,
          effectiveMs: state.effectiveMs,
          breakEndsAt: null,
          dayKey,
        })
        return false
      }
      return false
    }

    if (state.phase === 'training' && state.segmentStartedAt != null) {
      const delta = accrualDelta(state, now)
      const elapsedMs = Math.min(
        TRAINING_LIMIT_MS,
        state.elapsedMs + (delta?.wallDelta ?? 0),
      )
      const effectiveMs = state.effectiveMs + (delta?.effDelta ?? 0)
      if (delta) {
        set({
          elapsedMs,
          effectiveMs,
          lastAccrueAt: delta.lastAccrueAt,
        })
      }
      if (elapsedMs >= TRAINING_LIMIT_MS) {
        set(lockNow(elapsedMs, effectiveMs, state.dayKey))
        return false
      }
      return true
    }

    return true
  },

  canInteract: () => {
    get().tick()
    return get().phase !== 'locked'
  },

  resetDay: () => {
    const dayKey = localDayKey()
    set({
      phase: 'idle',
      elapsedMs: 0,
      effectiveMs: 0,
      focusScore: 1,
      segmentStartedAt: null,
      lastAccrueAt: null,
      breakEndsAt: null,
      dayKey,
    })
    persist({
      phase: 'idle',
      elapsedMs: 0,
      effectiveMs: 0,
      breakEndsAt: null,
      dayKey,
    })
  },
}))

/**
 * Live wall-clock elapsed including the active running segment.
 */
export function getLiveElapsedMs(
  state: Pick<
    TrainingTimerState,
    'elapsedMs' | 'phase' | 'segmentStartedAt' | 'lastAccrueAt' | 'focusScore'
  >,
  now = Date.now(),
): number {
  if (state.phase === 'training' && state.segmentStartedAt != null) {
    const from = state.lastAccrueAt ?? state.segmentStartedAt
    return Math.min(TRAINING_LIMIT_MS, state.elapsedMs + Math.max(0, now - from))
  }
  return state.elapsedMs
}

/**
 * Live effective (focus-weighted) ms including active segment.
 */
export function getLiveEffectiveMs(
  state: Pick<
    TrainingTimerState,
    'effectiveMs' | 'phase' | 'segmentStartedAt' | 'lastAccrueAt' | 'focusScore'
  >,
  now = Date.now(),
): number {
  if (state.phase === 'training' && state.segmentStartedAt != null) {
    const from = state.lastAccrueAt ?? state.segmentStartedAt
    const wallDelta = Math.max(0, now - from)
    return state.effectiveMs + wallDelta * state.focusScore
  }
  return state.effectiveMs
}

export function isEffectiveTargetMet(
  state: Parameters<typeof getLiveEffectiveMs>[0],
  now = Date.now(),
  targetMs = getETargetMs(),
): boolean {
  return getLiveEffectiveMs(state, now) >= targetMs
}

export function getBreakRemainingMs(
  state: Pick<TrainingTimerState, 'phase' | 'breakEndsAt'>,
  now = Date.now(),
): number {
  if (state.phase !== 'locked' || state.breakEndsAt == null) return 0
  return Math.max(0, state.breakEndsAt - now)
}

export function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Re-export for callers that only need the default constant. */
export { DEFAULT_E_TARGET_MS }

/** Optional: bind an external FocusTracker score into the store on an interval. */
export function syncFocusFromTracker(tracker: FocusTracker, now = Date.now()): void {
  useTrainingTimerStore.getState().setFocusScore(tracker.score(now))
}
