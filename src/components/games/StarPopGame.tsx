import { useCallback, useEffect, useRef, useState } from 'react'
import { useTrainingSession } from '../../hooks/useTrainingSession'
import { playTone } from '../../lib/audio'
import { toBlueCss, toRedCss } from '../../lib/colorConfig'
import { fillBwVerticalGrating } from '../../lib/grating'
import { useStageCanvas } from '../../hooks/useStageCanvas'
import { useColorConfigStore } from '../../store/colorConfigStore'
import { CanvasStage } from '../CanvasStage'
import {
  GameControls,
  GameHud,
  GameHudStat,
  GameShell,
  useGameShell,
} from '../GameShell'

interface Star {
  id: number
  x: number
  y: number
  r: number
  kind: 'red' | 'blue'
  born: number
}

export function StarPopGame() {
  const { begin, end, recordTrial, setClinical, locked } =
    useTrainingSession('starPop')
  const redCss = toRedCss(useColorConfigStore((s) => s.redR))
  const blueCss = toBlueCss(
    useColorConfigStore((s) => s.blueG),
    useColorConfigStore((s) => s.blueB),
  )
  const { canvasRef, sizeRef, syncSize } = useStageCanvas()
  const starsRef = useRef<Star[]>([])
  const idRef = useRef(1)
  const rafRef = useRef(0)
  const spawnAtRef = useRef(0)
  const countsRef = useRef({ redHits: 0, blueCollisions: 0 })
  const lastKindsRef = useRef<Array<'red' | 'blue'>>([])
  const [running, setRunning] = useState(false)
  const [score, setScore] = useState({ hits: 0, misses: 0 })
  const [message, setMessage] = useState('戴上红蓝眼镜：只戳红星，别戳蓝星')

  useEffect(() => {
    if (locked && running) {
      setRunning(false)
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

    const loop = (now: number) => {
      const { w, h } = sizeRef.current
      if (now >= spawnAtRef.current) {
        let kind: 'red' | 'blue' = Math.random() < 0.62 ? 'red' : 'blue'
        const recent = lastKindsRef.current
        if (
          recent.length >= 2 &&
          recent[recent.length - 1] === kind &&
          recent[recent.length - 2] === kind
        ) {
          kind = kind === 'red' ? 'blue' : 'red'
        }
        lastKindsRef.current = [...recent, kind].slice(-3)
        starsRef.current.push({
          id: idRef.current++,
          x: 40 + Math.random() * Math.max(10, w - 80),
          y: 40 + Math.random() * Math.max(10, h - 80),
          r: 22 + Math.random() * 14,
          kind,
          born: now,
        })
        spawnAtRef.current = now + 900 + Math.random() * 700
      }
      starsRef.current = starsRef.current.filter((s) => now - s.born < 3200)

      fillBwVerticalGrating(ctx, w, h, 26, (now * 0.012) % 80, 1)
      ctx.fillStyle = 'rgba(5,7,12,0.35)'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 4
      ctx.strokeRect(8, 8, w - 16, h - 16)

      for (const s of starsRef.current) {
        ctx.fillStyle = s.kind === 'red' ? redCss : blueCss
        drawStar(ctx, s.x, s.y, s.r)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, redCss, blueCss, syncSize, canvasRef, sizeRef])

  const onTap = useCallback(
    (clientX: number, clientY: number) => {
      if (!running) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const hit = [...starsRef.current]
        .reverse()
        .find((s) => Math.hypot(s.x - x, s.y - y) <= s.r + 8)
      if (!hit) {
        // Empty tap — ignore (do not punish miss-taps)
        return
      }
      starsRef.current = starsRef.current.filter((s) => s.id !== hit.id)
      if (hit.kind === 'red') {
        countsRef.current.redHits += 1
        recordTrial('hit', performance.now() - hit.born, 1)
        setClinical({
          redHits: countsRef.current.redHits,
          blueCollisions: countsRef.current.blueCollisions,
        })
        setScore((s) => ({ ...s, hits: s.hits + 1 }))
        playTone('success')
        setMessage('真棒！红星收集成功')
      } else {
        countsRef.current.blueCollisions += 1
        recordTrial('miss', null, 0)
        setClinical({
          redHits: countsRef.current.redHits,
          blueCollisions: countsRef.current.blueCollisions,
        })
        setScore((s) => ({ ...s, misses: s.misses + 1 }))
        playTone('error')
        setMessage('另一只眼睛也要一起看～蓝星要躲开')
      }
    },
    [running, recordTrial, setClinical, canvasRef],
  )

  const accuracy =
    score.hits + score.misses === 0
      ? 0
      : Math.round((score.hits / (score.hits + score.misses)) * 100)

  return (
    <GameShell title="戳红星" subtitle="抗抑制 · 需红蓝眼镜">
      <StarBody
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
          starsRef.current = []
          countsRef.current = { redHits: 0, blueCollisions: 0 }
          lastKindsRef.current = []
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

function StarBody(props: {
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
  const { canvasRef, running, score, accuracy, message, onResize, onTap, onStart, onEnd } = props
  return (
    <div className={isFullscreen ? 'flex min-h-0 flex-1 flex-col' : 'mx-auto flex w-full max-w-4xl flex-col px-4 py-4 sm:px-6'}>
      <GameHud>
        <GameHudStat label="红星" value={`${score.hits}`} />
        <GameHudStat label="失误" value={`${score.misses}`} />
        <GameHudStat label="准确率" value={`${accuracy}%`} />
        {isFullscreen && <p className="ml-auto self-center text-xs font-bold text-white/70">{message}</p>}
      </GameHud>
      {!isFullscreen && <p className="mb-2 text-center text-sm font-extrabold text-slate-700">{message}</p>}
      <CanvasStage className="bg-black" onResize={onResize}>
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
          <button type="button" className="min-h-12 rounded-2xl bg-rose-500 px-6 py-3 font-extrabold text-white" onClick={onStart}>开始训练</button>
        ) : (
          <button type="button" className={isFullscreen ? 'min-h-12 rounded-2xl bg-white px-6 py-3 font-extrabold text-slate-900' : 'min-h-12 rounded-2xl bg-white px-6 py-3 font-extrabold text-slate-700 ring-1 ring-slate-200'} onClick={onEnd}>结束并保存</button>
        )}
      </GameControls>
    </div>
  )
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 5; i += 1) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
    const b = a + Math.PI / 5
    const x1 = cx + Math.cos(a) * r
    const y1 = cy + Math.sin(a) * r
    const x2 = cx + Math.cos(b) * (r * 0.45)
    const y2 = cy + Math.sin(b) * (r * 0.45)
    if (i === 0) ctx.moveTo(x1, y1)
    else ctx.lineTo(x1, y1)
    ctx.lineTo(x2, y2)
  }
  ctx.closePath()
  ctx.fill()
}
