import { clamp, GABOR_LIMITS, type GaborStimulusState } from './gabor'
import { pickAngleExcluding } from './gameRandom'

export type StaircaseOutcome = 'hit' | 'miss'

export interface StaircaseState {
  stimulus: GaborStimulusState
  /** Consecutive correct hits toward the next difficulty step. */
  successiveHits: number
  /** Difficulty steps taken (for threshold curve). */
  step: number
}

export interface ThresholdSample {
  trial: number
  contrast: number
  spatialFrequency: number
  outcome: StaircaseOutcome
  reactionMs: number | null
}

export interface StaircaseUpdateResult {
  next: StaircaseState
  /** Which parameter was adjusted this trial, if any. */
  adjusted: 'contrast' | 'spatialFrequency' | 'none'
}

/**
 * Create the initial staircase stimulus.
 * Starts smaller / finer than early kid builds (patch size handled in GaborGame).
 */
export function createInitialStaircase(startContrast?: number): StaircaseState {
  const contrast =
    startContrast != null
      ? clamp(startContrast, GABOR_LIMITS.contrast.min, GABOR_LIMITS.contrast.max)
      : 1.0
  return {
    stimulus: {
      spatialFrequency: 0.04,
      contrast,
      orientationDeg: Math.random() * 180,
      sigma: 13,
    },
    successiveHits: 0,
    step: 0,
  }
}

/**
 * 3-down / 1-up adaptive update with gentle step sizes.
 * Success ×3 → harder (contrast −6% or SF +3%).
 * Miss/timeout ×1 → easier (contrast +12% or SF −8%).
 */
export function updateStaircase(
  state: StaircaseState,
  outcome: StaircaseOutcome,
): StaircaseUpdateResult {
  const stimulus = { ...state.stimulus }

  if (outcome === 'miss') {
    const preferContrast =
      stimulus.contrast < GABOR_LIMITS.contrast.max * 0.95 ||
      Math.random() < 0.5

    if (preferContrast) {
      stimulus.contrast = clamp(
        stimulus.contrast * 1.12,
        GABOR_LIMITS.contrast.min,
        GABOR_LIMITS.contrast.max,
      )
      return {
        next: { stimulus, successiveHits: 0, step: state.step + 1 },
        adjusted: 'contrast',
      }
    }

    stimulus.spatialFrequency = clamp(
      stimulus.spatialFrequency * 0.92,
      GABOR_LIMITS.spatialFrequency.min,
      GABOR_LIMITS.spatialFrequency.max,
    )
    return {
      next: { stimulus, successiveHits: 0, step: state.step + 1 },
      adjusted: 'spatialFrequency',
    }
  }

  const successiveHits = state.successiveHits + 1
  if (successiveHits < 3) {
    return {
      next: { ...state, stimulus, successiveHits },
      adjusted: 'none',
    }
  }

  const preferSf =
    stimulus.spatialFrequency < GABOR_LIMITS.spatialFrequency.max * 0.95 ||
    Math.random() < 0.5

  if (preferSf) {
    stimulus.spatialFrequency = clamp(
      stimulus.spatialFrequency * 1.03,
      GABOR_LIMITS.spatialFrequency.min,
      GABOR_LIMITS.spatialFrequency.max,
    )
    return {
      next: { stimulus, successiveHits: 0, step: state.step + 1 },
      adjusted: 'spatialFrequency',
    }
  }

  stimulus.contrast = clamp(
    stimulus.contrast * 0.94,
    GABOR_LIMITS.contrast.min,
    GABOR_LIMITS.contrast.max,
  )
  return {
    next: { stimulus, successiveHits: 0, step: state.step + 1 },
    adjusted: 'contrast',
  }
}

/**
 * Randomize orientation for the next trial while keeping adaptive params.
 * Do not jitter sigma here — difficulty only moves via staircase steps.
 * New orientation is at least 30° from the previous (on 0–180 circle).
 */
export function randomizeOrientation(state: StaircaseState): StaircaseState {
  return {
    ...state,
    stimulus: {
      ...state.stimulus,
      orientationDeg: pickAngleExcluding(state.stimulus.orientationDeg, 30, 180),
    },
  }
}
