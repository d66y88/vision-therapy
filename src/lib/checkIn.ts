/**
 * Dual check-in: playlist complete AND effective minutes ≥ daily target.
 */
import { getETargetMs } from './focusScore'
import {
  getCompletedPlaylistIds,
  isPlaylistComplete,
} from './playlistProgress'
import { syncRewards } from './rewardsStore'
import {
  getCurrentStreak,
  markStreakDay,
  tryMakeupBridge,
} from './streakStore'
import {
  getLiveEffectiveMs,
  useTrainingTimerStore,
} from '../store/trainingTimerStore'

/** Attempt today's check-in. Returns true when both conditions are met. */
export function tryDailyCheckIn(): boolean {
  if (!isPlaylistComplete()) return false
  const timer = useTrainingTimerStore.getState()
  const eff = getLiveEffectiveMs(timer)
  if (eff < getETargetMs()) return false
  markStreakDay()
  if (getCompletedPlaylistIds().length >= 1) {
    tryMakeupBridge()
  }
  syncRewards(getCurrentStreak())
  return true
}
