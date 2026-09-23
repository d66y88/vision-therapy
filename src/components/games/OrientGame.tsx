import { useCallback, useEffect, useRef, useState } from 'react'
import { GameShell, GameHud, GameHudStat, GameControls, useGameShell } from '../GameShell'
import { useTrainingSession } from '../../hooks/useTrainingSession'
import {
  getGameAbility,
  orientStartSizeForLevel,
} from '../../lib/abilityProfile'
import { playTone } from '../../lib/audio'
import { pickExcluding } from '../../lib/gameRandom'

type Dir = 'left' | 'right' | 'up' | 'down'

const DIRS: Dir[] = ['left', 'right', 'up', 'down']
const LABELS: Record<Dir, string> = {
  left: '←',
  right: '→',
  up: '↑',
  down: '↓',
}

const STIM_MS_BASE = 2800

/**
 * Orientation / acuity lite: which way does the fish face?
 */
export function OrientGame() {
  const { begin, end, recordTrial, locked } = useTrainingSession('orient')
  const [running, setRunning] = useState(false)
  const [awaiting, setAwaiting] = useState(false)
  const [dir, setDir] = useState<Dir>('right')
  const [size, setSize] = useState(96)
  const [score, setScore] = useState({ hits: 0, misses: 0, streak: 0 })
  const [message, setMessage] = useState('看清小鱼朝哪边，再点方向')
  const [trialAt, setTrialAt] = useState(0)
  const [showFish, setShowFish] = useState(true)
  const [remainMs, setRemainMs] = useState(STIM_MS_BASE)

  const dirRef = useRef<Dir>('right')
  const missStreakRef = useRef(0)
  const timeoutRef = useRef(0)
  const stimTimerRef = useRef(0)
  const tickRef = useRef(0)
  const awaitingRef = useRef(false)
  const runningRef = useRef(false)
  const lastTapRef = useRef(0)
  const stimMsRef = useRef(STIM_MS_BASE)
  runningRef.current = running

  const clearPending = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = 0
    }
    if (stimTimerRef.current) {
      window.clearTimeout(stimTimerRef.current)
      stimTimerRef.current = 0
    }
    if (tickRef.current) {
      window.clearInterval(tickRef.current)
      tickRef.current = 0
    }
  }, [])

  useEffect(() => {
    return () => clearPending()
  }, [clearPending])

  useEffect(() => {
    if (locked && running) {
      clearPending()
      setRunning(false)
      setAwaiting(false)
      awaitingRef.current = false
      void end({ save: true })
      setMessage('今日训练时间到，先休息～')
    }
  }, [locked, running, end, clearPending])

  const nextTrial = useCallback(() => {
    const next = pickExcluding(DIRS, dirRef.current)
    dirRef.current = next
    setDir(next)
    setShowFish(true)
    setTrialAt(performance.now())
    awaitingRef.current = true
    setAwaiting(true)
    setRemainMs(stimMsRef.current)

    if (tickRef.current) window.clearInterval(tickRef.current)
    const started = performance.now()
    tickRef.current = window.setInterval(() => {
      const left = Math.max(0, stimMsRef.current - (performance.now() - started))
      setRemainMs(left)
    }, 100)

    if (stimTimerRef.current) window.clearTimeout(stimTimerRef.current)
    stimTimerRef.current = window.setTimeout(() => {
      stimTimerRef.current = 0
      if (!runningRef.current || !awaitingRef.current) return
      awaitingRef.current = false
      setAwaiting(false)
      setShowFish(false)
      if (tickRef.current) {
        window.clearInterval(tickRef.current)
        tickRef.current = 0
      }
      missStreakRef.current += 1
      recordTrial('miss', null, 0)
      playTone('error')
      setScore((s) => ({ hits: s.hits, misses: s.misses + 1, streak: 0 }))
      if (missStreakRef.current >= 2 && missStreakRef.current % 2 === 0) {
        setSize((z) => Math.min(120, z + 8))
        stimMsRef.current = Math.min(3600, stimMsRef.current + 200)
      }
      setMessage('时间到啦，看仔细再点～')
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = 0
        if (runningRef.current) nextTrial()
      }, 700)
    }, stimMsRef.current)
  }, [recordTrial])

  const answer = (choice: Dir) => {
    if (!runningRef.current || !awaitingRef.current) return
    const now = performance.now()
    if (now - lastTapRef.current < 280) {
      setMessage('太快点啦，看清楚再选～')
      return
    }
    lastTapRef.current = now
    awaitingRef.current = false
    setAwaiting(false)
    setShowFish(false)
    clearPending()

    const correct = dirRef.current
    const rt = now - trialAt
    if (choice === correct) {
      missStreakRef.current = 0
      recordTrial('hit', rt, 1)
      playTone('success')
      setScore((s) => {
        const streak = s.streak + 1
        if (streak > 0 && streak % 4 === 0) {
          setSize((z) => Math.max(48, z - 6))
          stimMsRef.current = Math.max(1600, stimMsRef.current - 150)
          setMessage('更难一点点！鱼更小、时间更短～')
        } else {
          setMessage('答对啦！')
        }
        return { hits: s.hits + 1, misses: s.misses, streak }
      })
    } else {
      missStreakRef.current += 1
      recordTrial('miss', rt, 0)
      playTone('error')
      setScore((s) => ({ hits: s.hits, misses: s.misses + 1, streak: 0 }))
      if (missStreakRef.current >= 2 && missStreakRef.current % 2 === 0) {
        setSize((z) => Math.min(120, z + 8))
        stimMsRef.current = Math.min(3600, stimMsRef.current + 200)
      }
      setMessage('再看仔细一点～')
    }
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = 0
      if (runningRef.current) nextTrial()
    }, 900)
  }

  const accuracy =
    score.hits + score.misses === 0
      ? 0
      : Math.round((score.hits / (score.hits + score.misses)) * 100)

  const rotate =
    dir === 'right' ? 0 : dir === 'down' ? 90 : dir === 'left' ? 180 : 270

  return (
    <GameShell title="小鱼朝哪边" subtitle="朝向分辨 · 限时刺激">
      <OrientBody
        running={running}
        awaiting={awaiting}
        score={score}
        accuracy={accuracy}
        size={size}
        message={message}
        rotate={rotate}
        showFish={showFish}
        remainMs={remainMs}
        answer={answer}
        onStart={() => {
          if (!begin()) {
            setMessage('今日训练时间已用完')
            return
          }
          clearPending()
          missStreakRef.current = 0
          lastTapRef.current = 0
          const ability = getGameAbility('orient')
          const startSize = orientStartSizeForLevel(ability.level)
          stimMsRef.current = Math.round(STIM_MS_BASE - ability.level * 200)
          setScore({ hits: 0, misses: 0, streak: 0 })
          setSize(startSize)
          setMessage('小鱼会出现一下，看清朝向再点～')
          setRunning(true)
          nextTrial()
          playTone('tick')
        }}
        onEnd={() => {
          clearPending()
          setRunning(false)
          setAwaiting(false)
          awaitingRef.current = false
          void end({ save: true })
          setMessage(
            accuracy >= 70
              ? `本局准确 ${accuracy}%，眼睛很灵！`
              : '已保存本局记录，明天再练会更稳',
          )
        }}
      />
    </GameShell>
  )
}

function OrientBody({
  running,
  awaiting,
  score,
  accuracy,
  size,
  message,
  rotate,
  showFish,
  remainMs,
  answer,
  onStart,
  onEnd,
}: {
  running: boolean
  awaiting: boolean
  score: { hits: number; misses: number; streak: number }
  accuracy: number
  size: number
  message: string
  rotate: number
  showFish: boolean
  remainMs: number
  answer: (d: Dir) => void
  onStart: () => void
  onEnd: () => void
}) {
  const { isFullscreen } = useGameShell()
  const fishSize = size
  const canAnswer = running && awaiting

  return (
    <div
      className={
        isFullscreen
          ? 'flex min-h-0 flex-1 flex-col'
          : 'mx-auto flex w-full max-w-4xl flex-col px-4 py-4 sm:px-6'
      }
    >
      <GameHud>
        <GameHudStat label="正确" value={`${score.hits}`} />
        <GameHudStat label="准确率" value={`${accuracy}%`} />
        <GameHudStat
          label="剩余"
          value={running ? `${Math.ceil(remainMs / 1000)}s` : '—'}
        />
        {isFullscreen && (
          <p className="ml-auto self-center text-base font-bold text-white/80">{message}</p>
        )}
      </GameHud>
      {!isFullscreen && (
        <p className="mb-4 text-center text-lg font-extrabold text-slate-700">{message}</p>
      )}

      <div
        className={
          isFullscreen
            ? 'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden'
            : 'relative mb-6 flex min-h-52 items-center justify-center overflow-hidden rounded-3xl ring-1 ring-sky-100'
        }
      >
        <div
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg,#0c4a6e 0 14px,#e0f2fe 14px 28px)',
            backgroundSize: '28px 100%',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-950/50 via-transparent to-sky-950/40" />
        {running && showFish ? (
          <div
            className="relative z-[1] drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)]"
            style={{
              width: fishSize,
              height: fishSize,
              transform: `rotate(${rotate}deg)`,
              transition: 'width 0.25s ease, height 0.25s ease, transform 0.2s ease',
            }}
          >
            <svg
              viewBox="0 0 100 60"
              width="100%"
              height="100%"
              aria-hidden
              className="overflow-visible"
            >
              <ellipse cx="48" cy="32" rx="34" ry="14" fill="#0369a1" opacity="0.35" />
              <ellipse cx="48" cy="30" rx="36" ry="20" fill="#38bdf8" />
              <ellipse cx="42" cy="28" rx="18" ry="10" fill="#7dd3fc" opacity="0.55" />
              <polygon points="12,30 0,8 0,52" fill="#0284c7" />
              <circle cx="68" cy="24" r="6" fill="#0f172a" />
              <circle cx="70" cy="22.5" r="2.2" fill="#fff" />
              <path d="M78 30 Q88 20 96 30 Q88 40 78 30" fill="#fb923c" />
              <path d="M78 30 Q88 24 94 30" fill="#fdba74" />
            </svg>
          </div>
        ) : (
          <p className={`relative z-[1] text-lg font-bold ${isFullscreen ? 'text-white/70' : 'text-slate-600'}`}>
            {running ? '……' : '开始后小鱼会出现在这里'}
          </p>
        )}
      </div>

      <div className={`mx-auto grid max-w-sm grid-cols-3 gap-3 ${isFullscreen ? 'py-3' : ''}`}>
        <div />
        <DirBtn label={LABELS.up} onClick={() => answer('up')} disabled={!canAnswer} />
        <div />
        <DirBtn label={LABELS.left} onClick={() => answer('left')} disabled={!canAnswer} />
        <DirBtn label="·" onClick={() => undefined} disabled />
        <DirBtn label={LABELS.right} onClick={() => answer('right')} disabled={!canAnswer} />
        <div />
        <DirBtn label={LABELS.down} onClick={() => answer('down')} disabled={!canAnswer} />
        <div />
      </div>

      <GameControls>
        {!running ? (
          <button type="button" className="min-h-14 rounded-2xl bg-sky-500 px-6 py-3 text-lg font-extrabold text-white" onClick={onStart}>
            开始训练
          </button>
        ) : (
          <button
            type="button"
            className={isFullscreen ? 'min-h-12 rounded-2xl bg-white px-6 py-3 font-extrabold text-slate-900' : 'min-h-14 rounded-2xl bg-white px-6 py-3 text-lg font-extrabold text-slate-700 ring-1 ring-slate-200'}
            onClick={onEnd}
          >
            结束并保存
          </button>
        )}
      </GameControls>
    </div>
  )
}

function DirBtn({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-16 min-w-16 rounded-2xl bg-white text-3xl font-black text-slate-700 shadow-sm ring-2 ring-sky-100 disabled:opacity-40"
    >
      {label}
    </button>
  )
}
