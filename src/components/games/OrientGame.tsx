import { useCallback, useEffect, useRef, useState } from 'react'
import { GameShell, GameHud, GameHudStat, GameControls, useGameShell } from '../GameShell'
import { useTrainingSession } from '../../hooks/useTrainingSession'
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

  const dirRef = useRef<Dir>('right')
  const missStreakRef = useRef(0)
  const timeoutRef = useRef(0)
  const awaitingRef = useRef(false)
  const runningRef = useRef(false)
  runningRef.current = running

  const clearPending = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = 0
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
    setTrialAt(performance.now())
    awaitingRef.current = true
    setAwaiting(true)
  }, [])

  const answer = (choice: Dir) => {
    if (!runningRef.current || !awaitingRef.current) return
    awaitingRef.current = false
    setAwaiting(false)

    const correct = dirRef.current
    const rt = performance.now() - trialAt
    if (choice === correct) {
      missStreakRef.current = 0
      recordTrial('hit', rt, 1)
      playTone('success')
      setScore((s) => {
        const streak = s.streak + 1
        if (streak > 0 && streak % 4 === 0) {
          setSize((z) => Math.max(48, z - 6))
        }
        return { hits: s.hits + 1, misses: s.misses, streak }
      })
      setMessage('答对啦！')
    } else {
      missStreakRef.current += 1
      recordTrial('miss', rt, 0)
      playTone('error')
      setScore((s) => ({ hits: s.hits, misses: s.misses + 1, streak: 0 }))
      if (missStreakRef.current >= 2 && missStreakRef.current % 2 === 0) {
        setSize((z) => Math.min(120, z + 8))
      }
      setMessage('再看仔细一点～')
    }
    clearPending()
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
    <GameShell title="小鱼朝哪边" subtitle="朝向分辨 · 自适应大小">
      <OrientBody
        running={running}
        awaiting={awaiting}
        score={score}
        accuracy={accuracy}
        size={size}
        message={message}
        rotate={rotate}
        answer={answer}
        onStart={() => {
          if (!begin()) {
            setMessage('今日训练时间已用完')
            return
          }
          clearPending()
          missStreakRef.current = 0
          setScore({ hits: 0, misses: 0, streak: 0 })
          setSize(96)
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
          setMessage('已保存本局记录')
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
  answer: (d: Dir) => void
  onStart: () => void
  onEnd: () => void
}) {
  const { isFullscreen } = useGameShell()
  // Use adaptive size as-is; fullscreen enlarges the stage, not a hard 1.6× jump.
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
        <GameHudStat label="鱼大小" value={`${fishSize}px`} />
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
            : 'relative mb-6 flex min-h-48 items-center justify-center overflow-hidden rounded-3xl ring-1 ring-sky-100'
        }
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg,#111 0 18px,#f3f3f3 18px 36px)',
          backgroundSize: '36px 100%',
        }}
      >
        <div className="absolute inset-0 bg-sky-950/35" />
        {running ? (
          <div
            className="relative z-[1] drop-shadow-lg"
            style={{
              width: fishSize,
              height: fishSize,
              transform: `rotate(${rotate}deg)`,
              transition: 'width 0.25s ease, height 0.25s ease, transform 0.2s ease',
            }}
          >
            {/* Drawn facing RIGHT so rotate(0)=右 matches answer buttons on all platforms */}
            <svg
              viewBox="0 0 100 60"
              width="100%"
              height="100%"
              aria-hidden
              className="overflow-visible"
            >
              <ellipse cx="48" cy="30" rx="36" ry="20" fill="#38bdf8" />
              <polygon points="12,30 0,10 0,50" fill="#0ea5e9" />
              <circle cx="68" cy="24" r="5" fill="#0f172a" />
              <circle cx="69.5" cy="23" r="1.8" fill="#fff" />
              <path
                d="M78 30 Q88 22 96 30 Q88 38 78 30"
                fill="#f97316"
              />
            </svg>
          </div>
        ) : (
          <p className={`relative z-[1] ${isFullscreen ? 'text-white/70' : 'text-slate-600'}`}>
            开始后小鱼会出现在这里
          </p>
        )}
      </div>

      <div className={`mx-auto grid max-w-xs grid-cols-3 gap-2 ${isFullscreen ? 'py-3' : ''}`}>
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
          <button type="button" className="min-h-12 rounded-2xl bg-sky-500 px-6 py-3 font-extrabold text-white" onClick={onStart}>
            开始训练
          </button>
        ) : (
          <button
            type="button"
            className={isFullscreen ? 'min-h-12 rounded-2xl bg-white px-6 py-3 font-extrabold text-slate-900' : 'min-h-12 rounded-2xl bg-white px-6 py-3 font-extrabold text-slate-700 ring-1 ring-slate-200'}
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
      className="min-h-14 min-w-14 rounded-2xl bg-white text-2xl font-black text-slate-700 ring-1 ring-slate-200 disabled:opacity-40"
    >
      {label}
    </button>
  )
}
