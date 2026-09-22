import { localDayKey } from '../store/trainingTimerStore'
import {
  getDailyPlaylist,
  getRotationPeriodIndex,
  type GameDef,
  type GameId,
} from './gameCatalog'

const STORAGE_KEY = 'vision_playlist_progress'
/** Calibration older than this requires re-check before glasses games. */
export const CALIBRATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface PlaylistProgressFile {
  dayKey: string
  periodIndex: number
  completed: GameId[]
}

export interface PlaylistProgressSnapshot {
  games: GameDef[]
  completed: GameId[]
  next: GameId | null
  allDone: boolean
}

function emptyProgress(): PlaylistProgressFile {
  return {
    dayKey: localDayKey(),
    periodIndex: getRotationPeriodIndex(),
    completed: [],
  }
}

function loadRaw(): PlaylistProgressFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyProgress()
    const parsed = JSON.parse(raw) as PlaylistProgressFile
    const today = localDayKey()
    const period = getRotationPeriodIndex()
    if (parsed.dayKey !== today || parsed.periodIndex !== period) {
      return emptyProgress()
    }
    return {
      dayKey: parsed.dayKey,
      periodIndex: parsed.periodIndex,
      completed: Array.isArray(parsed.completed) ? parsed.completed : [],
    }
  } catch {
    return emptyProgress()
  }
}

function saveRaw(data: PlaylistProgressFile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

/**
 * Mark a required playlist game as completed for today.
 */
export function markPlaylistGameDone(id: GameId): void {
  const data = loadRaw()
  if (!data.completed.includes(id)) {
    data.completed.push(id)
    saveRaw(data)
  }
}

/**
 * Today's completed required-game ids.
 */
export function getCompletedPlaylistIds(): GameId[] {
  return loadRaw().completed
}

/**
 * True when every game on today's required playlist is done.
 */
export function isPlaylistComplete(date = new Date()): boolean {
  const playlist = getDailyPlaylist(date)
  const done = new Set(getCompletedPlaylistIds())
  return playlist.games.every((g) => done.has(g.id))
}

/** Whether this game is on today's required playlist. */
export function isOnTodaysPlaylist(id: GameId, date = new Date()): boolean {
  return getDailyPlaylist(date).games.some((g) => g.id === id)
}

/**
 * Next incomplete required game in playlist order.
 * If `afterId` is on the list, search starts after it (wrap-around).
 */
export function getNextIncompleteGame(
  afterId?: GameId,
  date = new Date(),
): GameId | null {
  const playlist = getDailyPlaylist(date)
  const done = new Set(getCompletedPlaylistIds())
  const ids = playlist.games.map((g) => g.id)
  if (ids.length === 0) return null

  let start = 0
  if (afterId != null) {
    const idx = ids.indexOf(afterId)
    if (idx >= 0) start = (idx + 1) % ids.length
  }

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[(start + i) % ids.length]
    if (!done.has(id)) return id
  }
  return null
}

/** Snapshot for Home / App: games, completed set, recommended next. */
export function getPlaylistProgressSnapshot(
  date = new Date(),
): PlaylistProgressSnapshot {
  const playlist = getDailyPlaylist(date)
  const completed = getCompletedPlaylistIds()
  const done = new Set(completed)
  const next = playlist.games.find((g) => !done.has(g.id))?.id ?? null
  return {
    games: playlist.games,
    completed,
    next,
    allDone: next == null && playlist.games.length > 0,
  }
}

/**
 * Whether dichoptic calibration is fresh enough for glasses games.
 */
export function isCalibrationFresh(updatedAtIso: string): boolean {
  const t = Date.parse(updatedAtIso)
  if (!Number.isFinite(t) || t <= 0) return false
  // Default epoch (new Date(0)) means never calibrated for real.
  if (t < 86_400_000) return false
  return Date.now() - t <= CALIBRATION_MAX_AGE_MS
}

/** Module-level handler so session end can ask App to advance playlist. */
type AdvanceHandler = (finished: GameId) => void
let advanceHandler: AdvanceHandler | null = null
/** When true, the next notify is ignored (e.g. user tapped 回首页). */
let skipNextAdvance = false

export function setPlaylistAdvanceHandler(handler: AdvanceHandler | null): void {
  advanceHandler = handler
}

/** Suppress one upcoming playlist auto-advance (manual leave home). */
export function suppressNextPlaylistAdvance(): void {
  skipNextAdvance = true
}

export function notifyPlaylistAdvance(finished: GameId): void {
  if (skipNextAdvance) {
    skipNextAdvance = false
    return
  }
  advanceHandler?.(finished)
}
