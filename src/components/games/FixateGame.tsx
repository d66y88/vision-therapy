import { useEffect, useRef, useState } from 'react'
import { useTrainingSession } from '../../hooks/useTrainingSession'
import {
  fixatePauseMsForLevel,
  fixateSpeedForLevel,
  getGameAbility,
} from '../../lib/abilityProfile'
import { playTone } from '../../lib/audio'
import { fillBwVerticalGrating } from '../../lib/grating'
import { useStageCanvas } from '../../hooks/useStageCanvas'
import { CanvasStage } from '../CanvasStage'
import {
  GameControls,
  GameHud,
  GameHudStat,
  GameShell,
  useGameShell,
} from '../GameShell'

export function FixateGame() {
  const { begin, end, recordTrial, setClinical, locked } =
    useTrainingSession('fixate')
  const { canvasRef, sizeRef, syncSize } = useStageCanvas()
  const targetRef = useRef({
    x: 200,
    y: 200,
    paused: false,
    pauseUntil: 0,
    pauseStarted: 0,
  })
  const rafRef = useRef(0)
  const nextPauseRef = useRef(0)
  const pauseMsRef = useRef(1400)
  const speedRef = useRef(55)
  const catchRtsRef = useRef<number[]>([])

  const [running, setRunning] = useState(false)
  const [score, setScore] = useState({ hits: 0, misses: 0 })
  const [message, setMessage] = useState('光点停下发亮时，马上点中它（练注视稳定）')

  const pushClinical = () => {
    const list = catchRtsRef.current
    if (list.length === 0) return
    const mean = Math.round(list.reduce((a, b) => a + b, 0) / list.length)
    setClinical({ meanCatchRtMs: mean })
  }

  useEffect(() => {
    if (locked && running) {
      setRunning(false)
      pushClinical()
      void end({ save: true })
      setMessage('今日训练时间到，先休息～')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, running, end])

  useEffect(() => {
    if (!running) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    syncSize()
    const { w, h } = sizeRef.current
    targetRef.current = {
      x: w / 2,
      y: h / 2,
      paused: false,
      pauseUntil: 0,
      pauseStarted: 0,
    }
    nextPauseRef.current = performance.now() + 1800

    let angle = Math.random() * Math.PI * 2
    let last = performance.now()
    const pauseMs = pauseMsRef.current
    const speed = speedRef.current

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const { w: cw, h: ch } = sizeRef.current
      const t = targetRef.current

      if (!t.paused && now >= nextPauseRef.current) {
        t.paused = true
        t.pauseStarted = now
        t.pauseUntil = now + pauseMs
        playTone('tick')
      }
      if (t.paused && now >= t.pauseUntil) {
        t.paused = false
        nextPauseRef.current = now + 1600 + Math.random() * 1800
        angle = Math.random() * Math.PI * 2
        recordTrial('miss', null, 0)
        setScore((s) => ({ ...s, misses: s.misses + 1 }))
        setMessage('错过了，等下次停下再点')
      }

      if (!t.paused) {
        t.x += Math.cos(angle) * speed * dt
        t.y += Math.sin(angle) * speed * dt
        if (t.x < 40 || t.x > cw - 40) angle = Math.PI - angle
        if (t.y < 40 || t.y > ch - 40) angle = -angle
        t.x = Math.min(cw - 40, Math.max(40, t.x))
        t.y = Math.min(ch - 40, Math.max(40, t.y))
      }

      fillBwVerticalGrating(ctx, cw, ch, 22, (now * 0.01) % 60, 1)
      ctx.fillStyle = 'rgba(15,23,42,0.45)'
      ctx.fillRect(0, 0, cw, ch)
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cw / 2 - 12, ch / 2)
      ctx.lineTo(cw / 2 + 12, ch / 2)
      ctx.moveTo(cw / 2, ch / 2 - 12)
      ctx.lineTo(cw / 2, ch / 2 + 12)
      ctx.stroke()

      ctx.fillStyle = t.paused ? '#fbbf24' : '#38bdf8'
      ctx.beginPath()
      ctx.arc(t.x, t.y, t.paused ? 22 : 14, 0, Math.PI * 2)
      ctx.fill()
      if (t.paused) {
        const left = Math.max(0, t.pauseUntil - now)
        const frac = left / pauseMs
        ctx.beginPath()
        ctx.arc(t.x, t.y, 32, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'
        ctx.lineWidth = 5
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(t.x, t.y, 32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac)
        ctx.strokeStyle = '#fbbf24'
        ctx.lineWidth = 5
        ctx.stroke()
      }

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, recordTrial, syncSize, canvasRef, sizeRef])

  const onTap = (clientX: number, clientY: number) => {
    if (!running) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const t = targetRef.current
    if (!t.paused) {
      setMessage('等它停下发亮再点～现在还在飞')
      return
    }
    const hit = Math.hypot(t.x - x, t.y - y) <= 28
    if (hit) {
      const rt = performance.now() - t.pauseStarted
      catchRtsRef.current.push(rt)
      recordTrial('hit', rt, 1)
      pushClinical()
      playTone('success')
      setScore((s) => ({ ...s, hits: s.hits + 1 }))
      setMessage('抓住啦！注视很稳～')
      t.paused = false
      nextPauseRef.current = performance.now() + 1400 + Math.random() * 1400
    } else {
      recordTrial('miss', null, 0)
      playTone('error')
      setScore((s) => ({ ...s, misses: s.misses + 1 }))
      setMessage('差一点，再等它停下')
    }
  }

  const accuracy =
    score.hits + score.misses === 0
      ? 0
      : Math.round((score.hits / (score.hits + score.misses)) * 100)

  return (
    <GameShell title="盯住小光点" subtitle="注视稳定 · 停住再点">
      <FixateBody
        canvasRef={canvasRef}
        running={running}
        score={score}
        accuracy={accuracy}
        message={message}
        onResize={syncSize}
        onTap={onTap}
        onStart={() => {
          if (!begin()) {
            setMessage('今日训练时间已用完')
            return
          }
          const ability = getGameAbility('fixate')
          pauseMsRef.current = fixatePauseMsForLevel(ability.level)
          speedRef.current = fixateSpeedForLevel(ability.level)
          catchRtsRef.current = []
          setScore({ hits: 0, misses: 0 })
          setMessage('光点停下并亮起倒计时环时，马上点中（注视稳定）')
          setRunning(true)
          playTone('tick')
          requestAnimationFrame(syncSize)
        }}
        onEnd={() => {
          setRunning(false)
          pushClinical()
          void end({ save: true })
          setMessage(
            accuracy >= 70
              ? `注视抓住 ${accuracy}%，很稳！`
              : '已保存本局记录',
          )
        }}
      />
    </GameShell>
  )
}

function FixateBody(props: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  running: boolean
  score: { hits: number; misses: number }
  accuracy: number
  message: string
  onResize: () => void
  onTap: (x: number, y: number) => void
  onStart: () => void
  onEnd: () => void
}) {
  const { isFullscreen } = useGameShell()
  const { canvasRef, running, score, accuracy, message, onResize, onTap, onStart, onEnd } =
    props
  return (
    <div
      className={
        isFullscreen
          ? 'flex min-h-0 flex-1 flex-col'
          : 'mx-auto flex w-full max-w-4xl flex-col px-4 py-4 sm:px-6'
      }
    >
      <GameHud>
        <GameHudStat label="抓住" value={`${score.hits}`} />
        <GameHudStat label="失误" value={`${score.misses}`} />
        <GameHudStat label="准确率" value={`${accuracy}%`} />
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
      <CanvasStage className="bg-slate-900" onResize={onResize}>
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
            className="min-h-14 rounded-2xl bg-amber-500 px-6 py-3 text-lg font-extrabold text-white"
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
                : 'min-h-14 rounded-2xl bg-white px-6 py-3 text-lg font-extrabold text-slate-700 ring-1 ring-slate-200'
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
