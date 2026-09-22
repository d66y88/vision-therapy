import { useCallback, useEffect, useRef, useState } from 'react'
import { useTrainingSession } from '../../hooks/useTrainingSession'
import { playTone } from '../../lib/audio'
import { fitCanvasToParent } from '../../lib/fitCanvas'
import { fillSquareGrating } from '../../lib/grating'
import { CanvasStage } from '../CanvasStage'
import {
  GameControls,
  GameHud,
  GameHudStat,
  GameShell,
  useGameShell,
} from '../GameShell'

interface Bubble {
  id: number
  x: number
  y: number
  r: number
  born: number
  ttl: number
}

/**
 * Peripheral reaction: bubbles spawn around the field — pop ASAP.
 */
export function BubbleRushGame() {
  const { begin, end, recordTrial, locked } = useTrainingSession('bubbleRush')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bubblesRef = useRef<Bubble[]>([])
  const idRef = useRef(1)
  const spawnAtRef = useRef(0)
  const rafRef = useRef(0)
  const sizeRef = useRef({ w: 640, h: 420 })
  const runningRef = useRef(false)

  const [running, setRunning] = useState(false)
  const [score, setScore] = useState({ hits: 0, misses: 0 })
  const [message, setMessage] = useState('泡泡一出现就快点破！')

  runningRef.current = running

  useEffect(() => {
    if (locked && running) {
      setRunning(false)
      void end({ save: true })
      setMessage('今日训练时间到，先休息～')
    }
  }, [locked, running, end])

  const syncSize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    sizeRef.current = fitCanvasToParent(canvas, ctx)
  }, [])

  useEffect(() => {
    if (!running) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    syncSize()

    const loop = (now: number) => {
      const { w, h } = sizeRef.current

      if (now >= spawnAtRef.current) {
        const edge = Math.random()
        let x = w * 0.5
        let y = h * 0.5
        if (edge < 0.25) {
          x = 30 + Math.random() * Math.max(10, w * 0.25)
          y = 30 + Math.random() * Math.max(10, h - 60)
        } else if (edge < 0.5) {
          x = w * 0.75 + Math.random() * Math.max(10, w * 0.25 - 30)
          y = 30 + Math.random() * Math.max(10, h - 60)
        } else if (edge < 0.75) {
          x = 30 + Math.random() * Math.max(10, w - 60)
          y = 30 + Math.random() * Math.max(10, h * 0.25)
        } else {
          x = 30 + Math.random() * Math.max(10, w - 60)
          y = h * 0.75 + Math.random() * Math.max(10, h * 0.25 - 30)
        }
        bubblesRef.current.push({
          id: idRef.current++,
          x,
          y,
          r: 26 + Math.random() * 14,
          born: now,
          ttl: 2400 + Math.random() * 900,
        })
        spawnAtRef.current = now + 750 + Math.random() * 650
      }

      const before = bubblesRef.current.length
      bubblesRef.current = bubblesRef.current.filter((b) => now - b.born < b.ttl)
      const expired = before - bubblesRef.current.length
      if (expired > 0) {
        for (let i = 0; i < expired; i += 1) recordTrial('miss', null, 0)
        setScore((s) => ({ ...s, misses: s.misses + expired }))
      }

      fillSquareGrating(ctx, 0, 0, w, h, {
        barWidth: 28,
        colorA: '#dff6ff',
        colorB: '#b8e6f7',
        axis: 'horizontal',
        phase: (now * 0.008) % 56,
        alpha: 1,
      })
      ctx.fillStyle = '#0f172a'
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, 4, 0, Math.PI * 2)
      ctx.fill()

      for (const b of bubblesRef.current) {
        const life = 1 - (now - b.born) / b.ttl
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(14,165,233,${0.35 + life * 0.5})`
        ctx.fill()
        ctx.strokeStyle = '#0369a1'
        ctx.lineWidth = 3
        ctx.stroke()
      }

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, recordTrial, syncSize])

  const onTap = useCallback(
    (clientX: number, clientY: number) => {
      if (!running) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const hit = [...bubblesRef.current]
        .reverse()
        .find((b) => Math.hypot(b.x - x, b.y - y) <= b.r + 6)
      if (!hit) {
        // Empty tap — ignore
        return
      }
      bubblesRef.current = bubblesRef.current.filter((b) => b.id !== hit.id)
      recordTrial('hit', performance.now() - hit.born, 1)
      setScore((s) => ({ ...s, hits: s.hits + 1 }))
      playTone('success')
      setMessage('破！继续～')
    },
    [running, recordTrial],
  )

  const accuracy =
    score.hits + score.misses === 0
      ? 0
      : Math.round((score.hits / (score.hits + score.misses)) * 100)

  return (
    <GameShell title="泡泡冲冲冲" subtitle="周边反应 · 又快又准">
      <BubbleBody
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
          bubblesRef.current = []
          setScore({ hits: 0, misses: 0 })
          spawnAtRef.current = 0
          setRunning(true)
          playTone('tick')
          requestAnimationFrame(syncSize)
        }}
        onEnd={() => {
          setRunning(false)
          void end({ save: true })
          setMessage('已保存本局记录')
        }}
      />
    </GameShell>
  )
}

function BubbleBody({
  canvasRef,
  running,
  score,
  accuracy,
  message,
  onResize,
  onTap,
  onStart,
  onEnd,
}: {
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

  return (
    <div
      className={
        isFullscreen
          ? 'flex min-h-0 flex-1 flex-col'
          : 'mx-auto flex w-full max-w-4xl flex-col px-4 py-4 sm:px-6'
      }
    >
      <GameHud>
        <GameHudStat label="点破" value={`${score.hits}`} />
        <GameHudStat label="漏掉/误点" value={`${score.misses}`} />
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

      <CanvasStage
        className={isFullscreen ? 'bg-cyan-50' : 'bg-white shadow ring-1 ring-sky-100'}
        onResize={onResize}
      >
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
            className="min-h-12 rounded-2xl bg-sky-500 px-6 py-3 font-extrabold text-white"
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
