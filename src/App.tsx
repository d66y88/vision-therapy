import { useCallback, useEffect, useRef, useState } from 'react'
import { ColorCalibration } from './components/ColorCalibration'
import { DistanceGuard } from './components/DistanceGuard'
import { GamePlayer } from './components/GamePlayer'
import { HomeHub } from './components/HomeHub'
import { InstallHint } from './components/InstallHint'
import { ParentShell } from './components/ParentShell'
import {
  hasPassedSuppressionIntro,
  markSuppressionIntroPassed,
  SuppressionIntro,
} from './components/SuppressionIntro'
import { TrainingRitual, type RitualKind } from './components/TrainingRitual'
import { TrainingTimer } from './components/TrainingTimer'
import {
  getDailyPlaylist,
  getGameDef,
  type GameId,
} from './lib/gameCatalog'
import {
  getCompletedPlaylistIds,
  getNextIncompleteGame,
  isCalibrationFresh,
  isOnTodaysPlaylist,
  setPlaylistAdvanceHandler,
  suppressNextPlaylistAdvance,
} from './lib/playlistProgress'
import { requestSync } from './lib/sync/engine'
import { useColorConfigStore } from './store/colorConfigStore'
import { useSyncStore } from './store/syncStore'
import { useTrainingTimerStore } from './store/trainingTimerStore'

type Shell = 'kid' | 'parent'
type KidView = 'home' | 'play' | 'intro' | 'calibration'

/** Clinic demo: acuity + dichoptic balance + vergence. */
const DEMO_GAMES: GameId[] = ['gabor', 'contrastBalance', 'vergenceJump']

function App() {
  const [shell, setShell] = useState<Shell>('kid')
  const [view, setView] = useState<KidView>('home')
  const [activeGame, setActiveGame] = useState<GameId | null>(null)
  const [ritual, setRitual] = useState<RitualKind>(null)
  const [pendingGame, setPendingGame] = useState<GameId | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [demoStep, setDemoStep] = useState(0)
  const [showOpeningOnce, setShowOpeningOnce] = useState(true)
  const [lastFinished, setLastFinished] = useState<GameId | null>(null)
  const updatedAt = useColorConfigStore((s) => s.updatedAt)
  const advancingRef = useRef<GameId | null>(null)
  const demoModeRef = useRef(demoMode)
  demoModeRef.current = demoMode

  const showDistance =
    shell === 'kid' &&
    view === 'play' &&
    activeGame != null &&
    (getGameDef(activeGame)?.needsGlasses ||
      activeGame === 'gabor' ||
      activeGame === 'pursuit' ||
      activeGame === 'orient' ||
      activeGame === 'fixate' ||
      activeGame === 'bubbleRush' ||
      activeGame === 'saccadeJump' ||
      activeGame === 'vergenceJump' ||
      activeGame === 'beadString')

  const launchGame = useCallback(
    (id: GameId, opts?: { skipRitual?: boolean }) => {
      const def = getGameDef(id)
      if (def?.needsGlasses && !isCalibrationFresh(updatedAt)) {
        setPendingGame(id)
        setActiveGame(null)
        setView('calibration')
        return
      }
      if (def?.needsGlasses && !hasPassedSuppressionIntro()) {
        setPendingGame(id)
        setActiveGame(null)
        setView('intro')
        return
      }
      if (!opts?.skipRitual && showOpeningOnce) {
        setPendingGame(id)
        setActiveGame(null)
        setRitual('opening')
        setShowOpeningOnce(false)
        return
      }
      setActiveGame(id)
      setView('play')
    },
    [updatedAt, showOpeningOnce],
  )

  const playGame = (id: GameId) => {
    setDemoMode(false)
    setShell('kid')
    advancingRef.current = null
    launchGame(id)
  }

  const startDemo = () => {
    setDemoMode(true)
    setDemoStep(0)
    setShowOpeningOnce(true)
    setShell('kid')
    advancingRef.current = null
    if (!isCalibrationFresh(updatedAt)) {
      setView('calibration')
      return
    }
    launchGame(DEMO_GAMES[0])
  }

  const advanceAfterGame = useCallback((finished: GameId) => {
    if (advancingRef.current === finished) return
    advancingRef.current = finished
    setLastFinished(finished)

    if (demoModeRef.current) {
      const idx = DEMO_GAMES.indexOf(finished)
      if (idx >= 0 && idx < DEMO_GAMES.length - 1) {
        setRitual('between')
        setPendingGame(DEMO_GAMES[idx + 1])
        setActiveGame(null)
        setDemoStep(idx + 1)
        return
      }
      setRitual('closing')
      setActiveGame(null)
      setPendingGame(null)
      return
    }

    if (!isOnTodaysPlaylist(finished)) {
      setActiveGame(null)
      setView('home')
      advancingRef.current = null
      return
    }

    const next = getNextIncompleteGame(finished)
    if (next) {
      setRitual('between')
      setPendingGame(next)
      setActiveGame(null)
      return
    }

    setRitual('closing')
    setActiveGame(null)
    setPendingGame(null)
  }, [])

  useEffect(() => {
    setPlaylistAdvanceHandler((finished) => {
      // Defer so end() can finish unmount path without fighting state.
      queueMicrotask(() => advanceAfterGame(finished))
    })
    return () => setPlaylistAdvanceHandler(null)
  }, [advanceAfterGame])

  // Bootstrap cloud sync (no-op when unconfigured) + flush on tab hide.
  useEffect(() => {
    void useSyncStore.getState().init()
    const onHide = () => {
      if (document.visibilityState === 'hidden') requestSync('hidden')
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('online', () => requestSync('online'))
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])

  // Dose bar must only advance during an active game session — never on home,
  // rituals, calibration, intro, or parent shell.
  useEffect(() => {
    const inActivePlay = shell === 'kid' && view === 'play' && activeGame != null
    if (!inActivePlay) {
      useTrainingTimerStore.getState().pauseTraining()
    }
  }, [shell, view, activeGame])

  // Home playlist chips sit lower on the page; without a reset, entering a game
  // keeps that scroll offset and the GameShell「全屏」button sits above the
  // sticky nav (still in DOM, but invisible). Always land at the top of play.
  useEffect(() => {
    if (shell === 'kid' && view === 'play' && activeGame != null) {
      window.scrollTo(0, 0)
    }
  }, [shell, view, activeGame])

  const onRitualDone = () => {
    const kind = ritual
    const nextGame = pendingGame
    setRitual(null)
    if (kind === 'opening' && nextGame) {
      setPendingGame(null)
      setActiveGame(nextGame)
      setView('play')
      advancingRef.current = null
      return
    }
    if (kind === 'between') {
      if (nextGame) {
        setPendingGame(null)
        advancingRef.current = null
        launchGame(nextGame, { skipRitual: true })
      } else {
        setView('home')
        advancingRef.current = null
      }
      return
    }
    if (kind === 'closing') {
      setActiveGame(null)
      setView('home')
      setDemoMode(false)
      advancingRef.current = null
    }
  }

  const leavePlay = () => {
    // Explicit home — do not show next-game ritual.
    suppressNextPlaylistAdvance()
    setRitual(null)
    setPendingGame(null)
    advancingRef.current = null
    setActiveGame(null)
    setView('home')
  }

  const goKidHome = () => {
    if (view === 'play' || activeGame != null) {
      suppressNextPlaylistAdvance()
    }
    setShell('kid')
    setView('home')
    setActiveGame(null)
    setDemoMode(false)
    setRitual(null)
    setPendingGame(null)
    advancingRef.current = null
  }

  return (
    <div className="flex min-h-svh flex-col bg-gradient-to-b from-sky-50/80 to-white">
      <nav className="sticky top-0 z-10 border-b border-sky-100/80 bg-white/80 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <button type="button" className="text-left" onClick={goKidHome}>
              <p className="text-xl font-black text-slate-800 sm:text-2xl">
                视力小训练营
              </p>
              {demoMode && (
                <p className="text-base font-bold text-indigo-600">
                  演示 {demoStep + 1}/{DEMO_GAMES.length}
                </p>
              )}
            </button>
            <div className="flex flex-wrap items-center gap-2">
              {shell === 'kid' && (
                <button
                  type="button"
                  onClick={goKidHome}
                  className={`min-h-12 rounded-2xl px-4 py-2 text-base font-extrabold ${
                    view === 'home' || view === 'play'
                      ? 'bg-sky-500 text-white'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200'
                  }`}
                >
                  今日训练
                </button>
              )}
              {(view === 'play' || view === 'intro') && shell === 'kid' && (
                <button
                  type="button"
                  onClick={leavePlay}
                  className="min-h-12 rounded-2xl bg-white px-4 py-2 text-base font-extrabold text-slate-600 ring-1 ring-slate-200"
                >
                  回首页
                </button>
              )}
              <button
                type="button"
                aria-label="家长区"
                onClick={() => {
                  setActiveGame(null)
                  setShell('parent')
                }}
                className={`min-h-12 min-w-12 rounded-2xl text-lg font-black ${
                  shell === 'parent'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-white text-slate-500 ring-1 ring-slate-200'
                }`}
              >
                🔒
              </button>
            </div>
          </div>
          {shell === 'kid' && <TrainingTimer />}
          {showDistance && <DistanceGuard enabled />}
        </div>
      </nav>

      <main className="flex-1">
        {shell === 'parent' && (
          <ParentShell onExit={goKidHome} onStartDemo={startDemo} />
        )}
        {shell === 'kid' && view === 'home' && (
          <HomeHub
            onPlayGame={playGame}
            onNeedCalibration={() => setView('calibration')}
          />
        )}
        {shell === 'kid' && view === 'calibration' && (
          <ColorCalibration
            onSaved={() => {
              if (demoMode) {
                launchGame(DEMO_GAMES[0])
              } else if (pendingGame) {
                const id = pendingGame
                setPendingGame(null)
                launchGame(id)
              } else {
                setView('home')
              }
            }}
          />
        )}
        {shell === 'kid' && view === 'intro' && (
          <SuppressionIntro
            onPass={() => {
              markSuppressionIntroPassed()
              const id = pendingGame
              setPendingGame(null)
              if (id) launchGame(id, { skipRitual: !showOpeningOnce })
              else setView('home')
            }}
          />
        )}
        {shell === 'kid' && view === 'play' && activeGame && (
          <GamePlayer gameId={activeGame} />
        )}
      </main>

      <TrainingRitual
        kind={ritual}
        gameId={
          ritual === 'between'
            ? pendingGame
            : (pendingGame ?? activeGame)
        }
        finishedId={ritual === 'between' ? lastFinished : null}
        daysLeft={getDailyPlaylist().daysLeft}
        playlistDone={getCompletedPlaylistIds().length}
        stars={3}
        onDone={onRitualDone}
      />

      <footer className="border-t border-sky-100/80 px-4 py-3 text-center text-sm text-slate-500 sm:px-6">
        辅助训练，不能替代专业诊疗。数据本地保存，可选云同步。
      </footer>

      <InstallHint />
    </div>
  )
}

export default App
