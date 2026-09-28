import { useCallback, useEffect, useRef, useState } from 'react'
import { useTrainingSession } from '../../hooks/useTrainingSession'
import {
  getGameAbility,
  vergenceCueMsForLevel,
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

type Depth = 'near' | 'far'
type Phase = 'idle' | 'gap' | 'cue' | 'dual'

interface Target {
  depth: Depth
  x: number
  y: number
  halfW: number
  halfH: number
}

/**
 * Near–far vergence jumps: large “near” frame vs small “far” frame.
 * Occasional dual targets — tap the near one first (inhibition / priority).
 */
export function VergenceJumpGame() {
  const { begin, end, recordTrial, setClinical, locked } =
    useTrainingSession('vergenceJump')
  const { canvasRef, sizeRef, syncSize } = useStageCanvas()

  const phaseRef = useRef<Phase>('idle')
  const targetsRef = useRef<Target[]>([])
  const cueAtRef = useRef(0)
  const deadlineRef = useRef(0)
  const gapUntilRef = useRef(0)
  const cueMsRef = useRef(2000)
  const dualChanceRef = useRef(0.12)
  const rtsRef = useRef<number[]>([])
  const streakRef = useRef(0)
  const rafRef = useRef(0)
  const runningRef = useRef(false)
  const lastDepthRef = useRef<Depth | null>(null)

  const [running, setRunning] = useState(false)
  const [score, setScore] = useState({ hits: 0, misses: 0 })
  const [meanRt, setMeanRt] = useState(0)
  const [message, setMessage] = useState(
    '先看中央小点，再点出现的近景大框或远景小框',
  )

  runningRef.current = running

  const pushClinical = useCallback(() => {
    const list = rtsRef.current
    const mean =
      list.length === 0
        ? 0
        : Math.round(list.reduce((a, b) => a + b, 0) / list.length)
    setMeanRt(mean)
    setClinical({ meanVergenceRtMs: mean })
  }, [setClinical])

  const scheduleNext = useCallback((now: number) => {
    gapUntilRef.current = now + 400 + Math.random() * 400
    phaseRef.current = 'gap'
    targetsRef.current = []
  }, [])

  const makeTarget = useCallback((depth: Depth, w: number, h: number): Target => {
    const cx = w / 2
    const cy = h / 2
    // Keep targets off dead center so eyes must re-converge after fixation.
    const angle = Math.random() * Math.PI * 2
    const radius =
      depth === 'near'
        ? Math.min(w, h) * (0.18 + Math.random() * 0.12)
        : Math.min(w, h) * (0.26 + Math.random() * 0.16)
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius * 0.72
    if (depth === 'near') {
      const halfW = Math.min(w, h) * 0.16
      const halfH = halfW * 0.72
      return { depth, x, y, halfW, halfH }
    }
    const halfW = Math.min(w, h) * 0.055
    const halfH = halfW * 0.85
    return { depth, x, y, halfW, halfH }
  }, [])

  const spawnCue = useCallback(
    (now: number) => {
      const { w, h } = sizeRef.current
      const dual = Math.random() < dualChanceRef.current
      if (dual) {
        phaseRef.current = 'dual'
        targetsRef.current = [makeTarget('near', w, h), makeTarget('far', w, h)]
        setMessage('两个都出现了！先点近景大框')
      } else {
        let depth: Depth = Math.random() < 0.5 ? 'near' : 'far'
        if (lastDepthRef.current != null && Math.random() < 0.55) {
          depth = lastDepthRef.current === 'near' ? 'far' : 'near'
        }
        lastDepthRef.current = depth
        phaseRef.current = 'cue'
        targetsRef.current = [makeTarget(depth, w, h)]
        setMessage(depth === 'near' ? '近景大框！快点中' : '远景小框！看清再点')
      }
      cueAtRef.current = now
      deadlineRef.current = now + cueMsRef.current
      playTone('tick')
    },
    [makeTarget, sizeRef],
  )

  useEffect(() => {
    if (locked && running) {
      setRunning(false)
      runningRef.current = false
      pushClinical()
      void end({ save: true })
      setMessage('今日训练时间到，先休息～')
    }
  }, [locked, running, end, pushClinical])

  useEffect(() => {
    if (!running) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    syncSize()
    phaseRef.current = 'gap'
    gapUntilRef.current = performance.now() + 700

    const loop = (now: number) => {
      const { w, h } = sizeRef.current

      if (phaseRef.current === 'gap' && now >= gapUntilRef.current) {
        spawnCue(now)
      } else if (
        (phaseRef.current === 'cue' || phaseRef.current === 'dual') &&
        now >= deadlineRef.current
      ) {
        recordTrial('miss', null, 0)
        streakRef.current = Math.min(0, streakRef.current) - 1
        if (streakRef.current <= -2) {
          cueMsRef.current = Math.min(2800, cueMsRef.current + 120)
        }
        setScore((s) => ({ ...s, misses: s.misses + 1 }))
        setMessage('慢了，等下次近远切换')
        scheduleNext(now)
      }

      // Perspective-ish field: far sky → near floor
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#0c1929')
      grad.addColorStop(0.45, '#132238')
      grad.addColorStop(1, '#1a2f1f')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      // Horizon / depth cue
      ctx.strokeStyle = 'rgba(148,163,184,0.25)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, h * 0.42)
      ctx.lineTo(w, h * 0.42)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(148,163,184,0.12)'
      for (let i = 1; i <= 4; i += 1) {
        const y = h * 0.42 + (h * 0.58 * i) / 5
        ctx.beginPath()
        ctx.moveTo(w * 0.5 - (w * 0.08 * i), y)
        ctx.lineTo(w * 0.5 + (w * 0.08 * i), y)
        ctx.stroke()
      }

      // Central fixation
      const fx = w / 2
      const fy = h / 2
      ctx.fillStyle = '#f8fafc'
      ctx.beginPath()
      ctx.arc(fx, fy, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(248,250,252,0.45)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(fx - 14, fy)
      ctx.lineTo(fx + 14, fy)
      ctx.moveTo(fx, fy - 14)
      ctx.lineTo(fx, fy + 14)
      ctx.stroke()

      const lit =
        phaseRef.current === 'cue' || phaseRef.current === 'dual'
      if (lit) {
        for (const t of targetsRef.current) {
          const isNear = t.depth === 'near'
          ctx.fillStyle = isNear
            ? 'rgba(251,146,60,0.92)'
            : 'rgba(56,189,248,0.9)'
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = isNear ? 4 : 2.5
          roundRect(
            ctx,
            t.x - t.halfW,
            t.y - t.halfH,
            t.halfW * 2,
            t.halfH * 2,
            isNear ? 12 : 6,
          )
          ctx.fill()
          ctx.stroke()
          // Inner frame to read as “window”
          ctx.strokeStyle = 'rgba(15,23,42,0.35)'
          ctx.lineWidth = 1.5
          roundRect(
            ctx,
            t.x - t.halfW * 0.55,
            t.y - t.halfH * 0.55,
            t.halfW * 1.1,
            t.halfH * 1.1,
            isNear ? 6 : 3,
          )
          ctx.stroke()
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

  const hitTest = (x: number, y: number, t: Target) =>
    Math.abs(x - t.x) <= t.halfW && Math.abs(y - t.y) <= t.halfH

  const onTap = useCallback(
    (clientX: number, clientY: number) => {
      if (!runningRef.current) return
      const phase = phaseRef.current
      if (phase !== 'cue' && phase !== 'dual') return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const now = performance.now()
      const targets = targetsRef.current

      if (phase === 'dual') {
        const near = targets.find((t) => t.depth === 'near')
        const far = targets.find((t) => t.depth === 'far')
        if (near && hitTest(x, y, near)) {
          const rt = now - cueAtRef.current
          rtsRef.current.push(rt)
          recordTrial('hit', rt, 1)
          streakRef.current = Math.max(0, streakRef.current) + 1
          if (streakRef.current >= 3) {
            cueMsRef.current = Math.max(1100, cueMsRef.current - 80)
          }
          setScore((s) => ({ ...s, hits: s.hits + 1 }))
          setMessage('先近后远，集合散真棒！')
          playTone('success')
          pushClinical()
          scheduleNext(now)
          return
        }
        if (far && hitTest(x, y, far)) {
          recordTrial('miss', null, 0)
          streakRef.current = Math.min(0, streakRef.current) - 1
          setScore((s) => ({ ...s, misses: s.misses + 1 }))
          setMessage('双目标时先点近景大框哦')
          playTone('error')
          scheduleNext(now)
          return
        }
        return
      }

      const t = targets[0]
      if (!t) return
      if (hitTest(x, y, t)) {
        const rt = now - cueAtRef.current
        rtsRef.current.push(rt)
        recordTrial('hit', rt, 1)
        streakRef.current = Math.max(0, streakRef.current) + 1
        if (streakRef.current >= 3) {
          cueMsRef.current = Math.max(1100, cueMsRef.current - 80)
        }
        setScore((s) => ({ ...s, hits: s.hits + 1 }))
        setMessage(
          t.depth === 'near'
            ? rt < 550
              ? '近跳超快！'
              : '近景点中啦'
            : rt < 650
              ? '远跳真棒！'
              : '远景点中啦',
        )
        playTone('success')
        pushClinical()
        scheduleNext(now)
      } else {
        recordTrial('miss', null, 0)
        streakRef.current = Math.min(0, streakRef.current) - 1
        if (streakRef.current <= -2) {
          cueMsRef.current = Math.min(2800, cueMsRef.current + 120)
        }
        setScore((s) => ({ ...s, misses: s.misses + 1 }))
        setMessage('没点中框，看清远近再点')
        playTone('error')
        scheduleNext(now)
      }
    },
    [canvasRef, recordTrial, scheduleNext, pushClinical],
  )

  const accuracy =
    score.hits + score.misses === 0
      ? 0
      : Math.round((score.hits / (score.hits + score.misses)) * 100)

  return (
    <GameShell title="近远跳跳" subtitle="集合散 · 近大远小">
      <VergenceBody
        canvasRef={canvasRef}
        running={running}
        score={score}
        accuracy={accuracy}
        meanRt={meanRt}
        message={message}
        onResize={syncSize}
        onTap={onTap}
        onStart={() => {
          if (!begin()) {
            setMessage('今日训练时间已用完')
            return
          }
          const ability = getGameAbility('vergenceJump')
          cueMsRef.current = vergenceCueMsForLevel(ability.level)
          dualChanceRef.current = Math.min(
            0.22,
            0.1 + Math.max(0, ability.level) * 0.03,
          )
          targetsRef.current = []
          phaseRef.current = 'idle'
          streakRef.current = 0
          rtsRef.current = []
          lastDepthRef.current = null
          setScore({ hits: 0, misses: 0 })
          setMeanRt(0)
          setClinical({ meanVergenceRtMs: 0 })
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

function VergenceBody(props: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  running: boolean
  score: { hits: number; misses: number }
  accuracy: number
  meanRt: number
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
        {isFullscreen && (
          <p className="ml-auto self-center text-xs font-bold text-white/70">
            {message}
          </p>
        )}
      </GameHud>
      {!isFullscreen && (
        <p className="mb-2 text-center text-sm font-extrabold text-slate-700">
          {message}
        </p>
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
            className="min-h-12 rounded-2xl bg-fuchsia-500 px-6 py-3 font-extrabold text-white"
            onClick={onStart}
          >
            开始跳跳
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
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
