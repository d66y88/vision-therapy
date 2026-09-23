import { useCallback, useEffect, useRef, useState } from 'react'
import { useTrainingSession } from '../../hooks/useTrainingSession'
import {
  getGameAbility,
  saccadeGridForLevel,
} from '../../lib/abilityProfile'
import { playTone } from '../../lib/audio'
import { useStageCanvas } from '../../hooks/useStageCanvas'
import { CanvasStage } from '../CanvasStage'
import {
  GameControls,
  GameHud,
  GameHudStat,
  GameShell,
  useGameShell,
} from '../GameShell'

type Phase = 'idle' | 'cue' | 'fake' | 'gap'

/**
 * Grid saccades: light jumps to a cell — look then tap. ~8% fake flashes train inhibition.
 */
export function SaccadeJumpGame() {
  const { begin, end, recordTrial, setClinical, locked } =
    useTrainingSession('saccadeJump')
  const { canvasRef, sizeRef, syncSize } = useStageCanvas()

  const gridRef = useRef<3 | 4>(3)
  const targetRef = useRef(-1)
  const phaseRef = useRef<Phase>('idle')
  const cueAtRef = useRef(0)
  const deadlineRef = useRef(0)
  const gapUntilRef = useRef(0)
  const lastCellRef = useRef(-1)
  const streakRef = useRef(0)
  const cueMsRef = useRef(2200)
  const rtsRef = useRef<number[]>([])
  const rafRef = useRef(0)
  const runningRef = useRef(false)

  const [running, setRunning] = useState(false)
  const [score, setScore] = useState({ hits: 0, misses: 0 })
  const [meanRt, setMeanRt] = useState(0)
  const [message, setMessage] = useState('亮灯跳到哪格，先看再点；假闪别急着点')
  const [gridN, setGridN] = useState<3 | 4>(3)

  runningRef.current = running

  const pushClinical = useCallback(() => {
    const list = rtsRef.current
    const mean =
      list.length === 0
        ? 0
        : Math.round(list.reduce((a, b) => a + b, 0) / list.length)
    setMeanRt(mean)
    setClinical({ meanSaccadeRtMs: mean })
  }, [setClinical])

  const scheduleNext = useCallback((now: number) => {
    gapUntilRef.current = now + 450 + Math.random() * 350
    phaseRef.current = 'gap'
    targetRef.current = -1
  }, [])

  const spawnCue = useCallback(
    (now: number) => {
      const n = gridRef.current
      const total = n * n
      let cell = Math.floor(Math.random() * total)
      if (total > 1 && cell === lastCellRef.current) {
        cell = (cell + 1 + Math.floor(Math.random() * (total - 1))) % total
      }
      lastCellRef.current = cell
      targetRef.current = cell
      cueAtRef.current = now
      const isFake = Math.random() < 0.08
      if (isFake) {
        phaseRef.current = 'fake'
        deadlineRef.current = now + 280
        setMessage('假闪！忍住别点～')
        playTone('tick')
      } else {
        phaseRef.current = 'cue'
        deadlineRef.current = now + cueMsRef.current
        setMessage('亮灯在哪？快点中')
        playTone('tick')
      }
    },
    [],
  )

  useEffect(() => {
    if (locked && running) {
      setRunning(false)
      runningRef.current = false
      void end({ save: true })
      setMessage('今日训练时间到，先休息～')
    }
  }, [locked, running, end])

  useEffect(() => {
    if (!running) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    syncSize()
    phaseRef.current = 'gap'
    gapUntilRef.current = performance.now() + 600

    const loop = (now: number) => {
      const { w, h } = sizeRef.current
      const n = gridRef.current
      const pad = 16
      const gap = 10
      const cellW = (w - pad * 2 - gap * (n - 1)) / n
      const cellH = (h - pad * 2 - gap * (n - 1)) / n

      if (phaseRef.current === 'gap' && now >= gapUntilRef.current) {
        spawnCue(now)
      } else if (phaseRef.current === 'fake' && now >= deadlineRef.current) {
        // Successfully inhibited — count as hit
        recordTrial('hit', null, 1)
        streakRef.current = Math.max(0, streakRef.current) + 1
        if (streakRef.current >= 3) {
          cueMsRef.current = Math.max(1100, cueMsRef.current - 80)
        }
        setScore((s) => ({ ...s, hits: s.hits + 1 }))
        setMessage('忍住了！真棒')
        playTone('success')
        scheduleNext(now)
      } else if (phaseRef.current === 'cue' && now >= deadlineRef.current) {
        recordTrial('miss', null, 0)
        streakRef.current = Math.min(0, streakRef.current) - 1
        if (streakRef.current <= -2) {
          cueMsRef.current = Math.min(3200, cueMsRef.current + 120)
        }
        setScore((s) => ({ ...s, misses: s.misses + 1 }))
        setMessage('慢了一步，再看亮灯')
        scheduleNext(now)
      }

      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      for (let x = 0; x < w; x += 28) {
        ctx.fillRect(x, 0, 14, h)
      }

      const lit = phaseRef.current === 'cue' || phaseRef.current === 'fake'
      const target = targetRef.current

      for (let i = 0; i < n * n; i += 1) {
        const col = i % n
        const row = Math.floor(i / n)
        const x = pad + col * (cellW + gap)
        const y = pad + row * (cellH + gap)
        const isLit = lit && i === target
        ctx.fillStyle = isLit
          ? phaseRef.current === 'fake'
            ? '#fbbf24'
            : '#a78bfa'
          : '#1e293b'
        roundRect(ctx, x, y, cellW, cellH, 14)
        ctx.fill()
        ctx.strokeStyle = isLit ? '#fff' : 'rgba(255,255,255,0.18)'
        ctx.lineWidth = isLit ? 3 : 1.5
        ctx.stroke()
        if (isLit) {
          ctx.fillStyle = '#fff'
          ctx.beginPath()
          ctx.arc(x + cellW / 2, y + cellH / 2, Math.min(cellW, cellH) * 0.18, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [
    running,
    canvasRef,
    sizeRef,
    syncSize,
    spawnCue,
    scheduleNext,
    recordTrial,
  ])

  const onTap = useCallback(
    (clientX: number, clientY: number) => {
      if (!runningRef.current) return
      const phase = phaseRef.current
      if (phase !== 'cue' && phase !== 'fake') return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const { w, h } = sizeRef.current
      const n = gridRef.current
      const pad = 16
      const gap = 10
      const cellW = (w - pad * 2 - gap * (n - 1)) / n
      const cellH = (h - pad * 2 - gap * (n - 1)) / n
      const col = Math.floor((x - pad) / (cellW + gap))
      const row = Math.floor((y - pad) / (cellH + gap))
      if (col < 0 || row < 0 || col >= n || row >= n) return
      const localX = x - pad - col * (cellW + gap)
      const localY = y - pad - row * (cellH + gap)
      if (localX > cellW || localY > cellH) return
      const cell = row * n + col
      const now = performance.now()

      if (phase === 'fake') {
        recordTrial('miss', null, 0)
        streakRef.current = Math.min(0, streakRef.current) - 1
        if (streakRef.current <= -2) {
          cueMsRef.current = Math.min(3200, cueMsRef.current + 120)
        }
        setScore((s) => ({ ...s, misses: s.misses + 1 }))
        setMessage('这是假闪，下次忍住～')
        playTone('error')
        scheduleNext(now)
        return
      }

      if (cell === targetRef.current) {
        const rt = now - cueAtRef.current
        rtsRef.current.push(rt)
        recordTrial('hit', rt, 1)
        streakRef.current = Math.max(0, streakRef.current) + 1
        if (streakRef.current >= 3) {
          cueMsRef.current = Math.max(1100, cueMsRef.current - 80)
        }
        setScore((s) => ({ ...s, hits: s.hits + 1 }))
        setMessage(rt < 500 ? '超快！' : '点中啦！')
        playTone('success')
        pushClinical()
        scheduleNext(now)
      } else {
        recordTrial('miss', null, 0)
        streakRef.current = Math.min(0, streakRef.current) - 1
        if (streakRef.current <= -2) {
          cueMsRef.current = Math.min(3200, cueMsRef.current + 120)
        }
        setScore((s) => ({ ...s, misses: s.misses + 1 }))
        setMessage('看错格子了，再跟亮灯')
        playTone('error')
        scheduleNext(now)
      }
    },
    [canvasRef, sizeRef, recordTrial, scheduleNext, pushClinical],
  )

  const accuracy =
    score.hits + score.misses === 0
      ? 0
      : Math.round((score.hits / (score.hits + score.misses)) * 100)

  return (
    <GameShell title="灯光跳跳" subtitle="扫视定位 · 假闪忍住">
      <SaccadeBody
        canvasRef={canvasRef}
        running={running}
        score={score}
        accuracy={accuracy}
        meanRt={meanRt}
        gridN={gridN}
        message={message}
        onResize={syncSize}
        onTap={onTap}
        onStart={() => {
          if (!begin()) {
            setMessage('今日训练时间已用完')
            return
          }
          const ability = getGameAbility('saccadeJump')
          const n = saccadeGridForLevel(ability.level)
          gridRef.current = n
          setGridN(n)
          targetRef.current = -1
          phaseRef.current = 'idle'
          streakRef.current = 0
          cueMsRef.current = ability.level >= 1 ? 1800 : 2200
          rtsRef.current = []
          lastCellRef.current = -1
          setScore({ hits: 0, misses: 0 })
          setMeanRt(0)
          setClinical({ meanSaccadeRtMs: 0 })
          setRunning(true)
          playTone('tick')
          requestAnimationFrame(syncSize)
        }}
        onEnd={() => {
          setRunning(false)
          pushClinical()
          void end({ save: true })
          setMessage('已保存本局记录')
        }}
      />
    </GameShell>
  )
}

function SaccadeBody(props: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  running: boolean
  score: { hits: number; misses: number }
  accuracy: number
  meanRt: number
  gridN: 3 | 4
  message: string
  onResize: () => void
  onTap: (x: number, y: number) => void
  onStart: () => void
  onEnd: () => void
}) {
  const { isFullscreen } = useGameShell()
  const {
    canvasRef,
    running,
    score,
    accuracy,
    meanRt,
    gridN,
    message,
    onResize,
    onTap,
    onStart,
    onEnd,
  } = props
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
        <GameHudStat label="平均反应" value={meanRt > 0 ? `${meanRt}ms` : '—'} />
        <GameHudStat label="格子" value={`${gridN}×${gridN}`} />
        {isFullscreen && (
          <p className="ml-auto self-center text-xs font-bold text-white/70">{message}</p>
        )}
      </GameHud>
      {!isFullscreen && (
        <p className="mb-2 text-center text-sm font-extrabold text-slate-700">{message}</p>
      )}
      <CanvasStage className="bg-slate-950" onResize={onResize}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={(e) => {
            e.preventDefault()
            onTap(e.clientX, e.clientY)
          }}
        />
      </CanvasStage>
      <GameControls>
        {!running ? (
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-violet-500 px-6 py-3 font-extrabold text-white"
            onClick={onStart}
          >
            开始训练
          </button>
        ) : (
          <button
            type="button"
            className={
              isFullscreen
                ? 'min-h-12 rounded-2xl bg-white px-6 py-3 font-extrabold text-slate-900'
                : 'min-h-12 rounded-2xl bg-white px-6 py-3 font-extrabold text-slate-700 ring-1 ring-slate-200'
            }
            onClick={onEnd}
          >
            结束并保存
          </button>
        )}
      </GameControls>
    </div>
  )
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
