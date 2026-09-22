import { useCallback, useEffect, useRef } from 'react'
import { recordAbilityOutcome } from '../lib/abilityProfile'
import { FocusTracker, getETargetMs } from '../lib/focusScore'
import { getGameDef, getRotationPeriodIndex, type GameId } from '../lib/gameCatalog'
import {
  getCompletedPlaylistIds,
  isCalibrationFresh,
  isOnTodaysPlaylist,
  isPlaylistComplete,
  markPlaylistGameDone,
  notifyPlaylistAdvance,
} from '../lib/playlistProgress'
import { markStreakDay, tryMakeupBridge } from '../lib/streakStore'
import { average, saveTrainingSession } from '../lib/trainingDb'
import type { ClinicalMetrics, TrainingModule } from '../lib/trainingTypes'
import { computeBci } from '../lib/trainingTypes'
import { useColorConfigStore } from '../store/colorConfigStore'
import {
  getLiveEffectiveMs,
  useTrainingTimerStore,
} from '../store/trainingTimerStore'

interface SessionDraft {
  module: TrainingModule
  startedAt: string
  hits: number
  misses: number
  reactionMsList: number[]
  score: number
  activeMs: number
  segmentStartedAt: number | null
  clinical: ClinicalMetrics
  focus: FocusTracker
}

export interface EndSessionOptions {
  save?: boolean
}

function foldActive(draft: SessionDraft, now = Date.now()): void {
  if (draft.segmentStartedAt != null) {
    draft.activeMs += Math.max(0, now - draft.segmentStartedAt)
    draft.segmentStartedAt = null
  }
}

function baseClinical(module: TrainingModule): ClinicalMetrics {
  const def = getGameDef(module)
  const updatedAt = useColorConfigStore.getState().updatedAt
  return {
    woreGlasses: Boolean(def?.needsGlasses),
    calibrated: isCalibrationFresh(updatedAt),
    playlistPeriod: getRotationPeriodIndex(),
  }
}

/** Dual check-in: playlist complete AND effective minutes ≥ target. */
function tryCheckIn(): void {
  if (!isPlaylistComplete()) return
  const timer = useTrainingTimerStore.getState()
  const eff = getLiveEffectiveMs(timer)
  if (eff < getETargetMs()) return
  markStreakDay()
  if (getCompletedPlaylistIds().length >= 1) {
    tryMakeupBridge()
  }
}

/**
 * Bridges game start/stop with the global wall-clock + focus-weighted timer.
 */
export function useTrainingSession(module: TrainingModule) {
  const startTraining = useTrainingTimerStore((s) => s.startTraining)
  const pauseTraining = useTrainingTimerStore((s) => s.pauseTraining)
  const setFocusScore = useTrainingTimerStore((s) => s.setFocusScore)
  const phase = useTrainingTimerStore((s) => s.phase)
  const draftRef = useRef<SessionDraft | null>(null)
  const endingRef = useRef(false)

  const begin = useCallback(() => {
    const ok = startTraining()
    if (!ok) return false
    const focus = new FocusTracker()
    draftRef.current = {
      module,
      startedAt: new Date().toISOString(),
      hits: 0,
      misses: 0,
      reactionMsList: [],
      score: 0,
      activeMs: 0,
      segmentStartedAt: Date.now(),
      clinical: baseClinical(module),
      focus,
    }
    endingRef.current = false
    setFocusScore(1)
    return true
  }, [module, startTraining, setFocusScore])

  const recordTrial = useCallback(
    (outcome: 'hit' | 'miss', reactionMs: number | null, scoreDelta = 0) => {
      const draft = draftRef.current
      if (!draft) return
      if (outcome === 'hit') draft.hits += 1
      else draft.misses += 1
      if (reactionMs != null && Number.isFinite(reactionMs)) {
        draft.reactionMsList.push(reactionMs)
      }
      draft.score += scoreDelta
      draft.focus.reportTrial(outcome)
      setFocusScore(draft.focus.score())
    },
    [setFocusScore],
  )

  const reportInteract = useCallback(() => {
    const draft = draftRef.current
    if (!draft) return
    draft.focus.reportInteract()
    setFocusScore(draft.focus.score())
  }, [setFocusScore])

  const setPostureOk = useCallback(
    (ok: boolean) => {
      const draft = draftRef.current
      if (!draft) return
      draft.focus.setPostureOk(ok)
      setFocusScore(draft.focus.score())
    },
    [setFocusScore],
  )

  const setScore = useCallback((score: number) => {
    if (draftRef.current) draftRef.current.score = score
  }, [])

  const setClinical = useCallback((partial: Partial<ClinicalMetrics>) => {
    const draft = draftRef.current
    if (!draft) return
    draft.clinical = { ...draft.clinical, ...partial }
  }, [])

  const end = useCallback(
    async (opts?: EndSessionOptions) => {
      if (endingRef.current) return
      endingRef.current = true
      pauseTraining()
      const draft = draftRef.current
      draftRef.current = null
      const shouldSave = opts?.save !== false
      if (!draft || !shouldSave) {
        endingRef.current = false
        return
      }

      foldActive(draft)
      const total = draft.hits + draft.misses
      if (total === 0 && draft.score === 0) {
        endingRef.current = false
        return
      }

      const accuracy = total === 0 ? 0 : (draft.hits / total) * 100
      const endedAt = new Date().toISOString()

      const clinical: ClinicalMetrics = {
        ...draft.clinical,
        focusAvg: draft.focus.avgFocusPct(),
      }
      if (
        clinical.redHits != null &&
        clinical.blueCollisions != null &&
        clinical.bci == null
      ) {
        clinical.bci = computeBci(
          clinical.redHits,
          clinical.blueCollisions,
          accuracy,
        )
      }

      try {
        await saveTrainingSession({
          module: draft.module,
          startedAt: draft.startedAt,
          endedAt,
          durationMs: Math.max(0, draft.activeMs),
          accuracy,
          avgReactionMs: average(draft.reactionMsList),
          score: draft.score,
          clinical,
        })

        const id = draft.module as GameId
        markPlaylistGameDone(id)
        tryCheckIn()
        recordAbilityOutcome(id, accuracy)
        if (isOnTodaysPlaylist(id)) {
          notifyPlaylistAdvance(id)
        }
      } finally {
        endingRef.current = false
      }
    },
    [pauseTraining],
  )

  useEffect(() => {
    const onVisibility = () => {
      const draft = draftRef.current
      if (!draft) return
      if (document.hidden) {
        foldActive(draft)
        pauseTraining()
      } else if (phase !== 'locked') {
        draft.segmentStartedAt = Date.now()
        startTraining()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [pauseTraining, startTraining, phase])

  // Keep focus score ticking while a session is live (idle decay).
  useEffect(() => {
    const id = window.setInterval(() => {
      const draft = draftRef.current
      if (!draft) return
      setFocusScore(draft.focus.score())
    }, 1000)
    return () => window.clearInterval(id)
  }, [setFocusScore])

  useEffect(() => {
    return () => {
      if (draftRef.current) {
        void end({ save: true })
      } else {
        pauseTraining()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    begin,
    end,
    recordTrial,
    reportInteract,
    setPostureOk,
    setScore,
    setClinical,
    locked: phase === 'locked',
  }
}
