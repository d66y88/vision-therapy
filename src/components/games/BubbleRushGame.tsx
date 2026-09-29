import { useCallback, useEffect, useRef, useState } from 'react'
import { useTrainingSession } from '../../hooks/useTrainingSession'
import {
  bubbleSpawnGapForLevel,
  bubbleTtlForLevel,
  getGameAbility,
} from '../../lib/abilityProfile'
import { playTone } from '../../lib/audio'
import { fitCanvasToParent } from '../../lib/fitCanvas'
import { CanvasStage } from '../CanvasStage'
import {
  GameControls,
  GameHud,
  GameHudStat,
  GameShell,
  useGameShell,
} from '../GameShell'

const BALLOON_COLORS = [
  { body: '#fb7185', shade: '#e11d48', highlight: '#fecdd3' },
  { body: '#38bdf8', shade: '#0284c7', highlight: '#bae6fd' },
  { body: '#fbbf24', shade: '#d97706', highlight: '#fde68a' },
  { body: '#a78bfa', shade: '#7c3aed', highlight: '#ddd6fe' },
  { body: '#4ade80', shade: '#16a34a', highlight: '#bbf7d0' },
  { body: '#f472b6', shade: '#db2777', highlight: '#fbcfe8' },
]

/** Fallback system cursor if overlay needle can't render. Tip hotspot at 6,6. */
const NEEDLE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'>
    <defs>
      <linearGradient id='s' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='#e2e8f0'/>
        <stop offset='55%' stop-color='#94a3b8'/>
        <stop offset='100%' stop-color='#475569'/>
      </linearGradient>
    </defs>
    <line x1='6' y1='6' x2='28' y2='30' stroke='url(%23s)' stroke-width='2.4' stroke-linecap='round'/>
    <polygon points='6,6 11,7.5 7.5,11' fill='#cbd5e1' stroke='#64748b' stroke-width='0.6'/>
    <circle cx='30.5' cy='32.5' r='5' fill='#f43f5e' stroke='#9f1239' stroke-width='1.2'/>
    <circle cx='29' cy='31' r='1.6' fill='#fecdd3'/>
  </svg>`,
)}") 6 6, crosshair`

interface Balloon {
  id: number
  x: number
  y: number
  r: number
  born: number
  ttl: number
  color: (typeof BALLOON_COLORS)[number]
  sway: number
  rise: number
}

interface Shard {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  color: string
  born: number
  life: number
  /** elongated rubber scrap vs round spark */
  kind: 'scrap' | 'spark' | 'dot'
  rot: number
  spin: number
}

interface PopBurst {
  x: number
  y: number
  born: number
  color: string
  shade: string
}

/**
 * Peripheral reaction: colorful balloons float in — pop for sound + burst FX.
 * (Game id remains `bubbleRush` for session continuity.)
 */
export function BubbleRushGame() {
  const { begin, end, recordTrial, locked } = useTrainingSession('bubbleRush')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const balloonsRef = useRef<Balloon[]>([])
  const idRef = useRef(1)
  const spawnAtRef = useRef(0)
  const rafRef = useRef(0)
  const sizeRef = useRef({ w: 640, h: 420 })
  const runningRef = useRef(false)

  const spawnGapRef = useRef(800)
  const ttlBaseRef = useRef(2400)
  const popsRef = useRef<PopBurst[]>([])
  const shardsRef = useRef<Shard[]>([])

  const [running, setRunning] = useState(false)
  const [score, setScore] = useState({ hits: 0, misses: 0 })
  const [message, setMessage] = useState('盯住中间小点，四周气球一出现就扎破！')

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
          x = 36 + Math.random() * Math.max(10, w * 0.25)
          y = 40 + Math.random() * Math.max(10, h - 80)
        } else if (edge < 0.5) {
          x = w * 0.75 + Math.random() * Math.max(10, w * 0.25 - 36)
          y = 40 + Math.random() * Math.max(10, h - 80)
        } else if (edge < 0.75) {
          x = 36 + Math.random() * Math.max(10, w - 72)
          y = 40 + Math.random() * Math.max(10, h * 0.28)
        } else {
          x = 36 + Math.random() * Math.max(10, w - 72)
          y = h * 0.7 + Math.random() * Math.max(10, h * 0.25 - 40)
        }
        balloonsRef.current.push({
          id: idRef.current++,
          x,
          y,
          r: 24 + Math.random() * 12,
          born: now,
          ttl: ttlBaseRef.current + Math.random() * 900,
          color:
            BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)]!,
          sway: Math.random() * Math.PI * 2,
          rise: 6 + Math.random() * 12,
        })
        // Extra delay when several balloons are already on screen.
        const busy =
          balloonsRef.current.length >= 3
            ? 450
            : balloonsRef.current.length >= 2
              ? 220
              : 0
        spawnAtRef.current =
          now + spawnGapRef.current + Math.random() * 500 + busy
      }

      const before = balloonsRef.current.length
      balloonsRef.current = balloonsRef.current.filter((b) => now - b.born < b.ttl)
      const expired = before - balloonsRef.current.length
      if (expired > 0) {
        for (let i = 0; i < expired; i += 1) recordTrial('miss', null, 0)
        setScore((s) => ({ ...s, misses: s.misses + expired }))
        spawnGapRef.current = Math.min(2200, spawnGapRef.current + 80)
        ttlBaseRef.current = Math.min(4500, ttlBaseRef.current + 120)
      }

      popsRef.current = popsRef.current.filter((p) => now - p.born < 560)
      shardsRef.current = shardsRef.current.filter(
        (s) => now - s.born < s.life,
      )

      // Soft sky background
      const sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, '#e0f2fe')
      sky.addColorStop(1, '#fef3c7')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)

      // Stronger central fixation
      ctx.fillStyle = 'rgba(15,23,42,0.18)'
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, 18, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(w / 2 - 10, h / 2)
      ctx.lineTo(w / 2 + 10, h / 2)
      ctx.moveTo(w / 2, h / 2 - 10)
      ctx.lineTo(w / 2, h / 2 + 10)
      ctx.stroke()
      ctx.fillStyle = '#0f172a'
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, 5, 0, Math.PI * 2)
      ctx.fill()

      for (const b of balloonsRef.current) {
        const age = now - b.born
        const life = 1 - age / b.ttl
        const bob = Math.sin(age * 0.004 + b.sway) * 6
        const lift = -(age / b.ttl) * b.rise
        const cx = b.x + Math.sin(age * 0.003 + b.sway) * 5
        const cy = b.y + bob + lift
        const rx = b.r * 0.82
        const ry = b.r

        // String
        ctx.strokeStyle = `rgba(71,85,105,${0.45 + life * 0.35})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx, cy + ry * 0.92)
        ctx.quadraticCurveTo(
          cx + Math.sin(age * 0.005) * 8,
          cy + ry + 18,
          cx,
          cy + ry + 28,
        )
        ctx.stroke()

        // Balloon body
        const g = ctx.createRadialGradient(
          cx - rx * 0.35,
          cy - ry * 0.4,
          2,
          cx,
          cy,
          ry,
        )
        g.addColorStop(0, b.color.highlight)
        g.addColorStop(0.55, b.color.body)
        g.addColorStop(1, b.color.shade)
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.fill()
        ctx.strokeStyle = b.color.shade
        ctx.lineWidth = 2
        ctx.stroke()

        // Knot
        ctx.fillStyle = b.color.shade
        ctx.beginPath()
        ctx.moveTo(cx - 4, cy + ry * 0.88)
        ctx.lineTo(cx + 4, cy + ry * 0.88)
        ctx.lineTo(cx, cy + ry * 1.08)
        ctx.closePath()
        ctx.fill()

        // Gloss
        ctx.fillStyle = 'rgba(255,255,255,0.55)'
        ctx.beginPath()
        ctx.ellipse(
          cx - rx * 0.32,
          cy - ry * 0.35,
          rx * 0.22,
          ry * 0.28,
          -0.4,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }

      for (const p of popsRef.current) {
        const age = (now - p.born) / 560
        const flash = Math.max(0, 1 - age * 4)

        // Hot white flash at the instant of burst
        if (flash > 0) {
          const fg = ctx.createRadialGradient(
            p.x,
            p.y,
            0,
            p.x,
            p.y,
            28 + flash * 20,
          )
          fg.addColorStop(0, `rgba(255,255,255,${flash * 0.95})`)
          fg.addColorStop(0.45, `rgba(255,240,200,${flash * 0.55})`)
          fg.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.fillStyle = fg
          ctx.beginPath()
          ctx.arc(p.x, p.y, 48, 0, Math.PI * 2)
          ctx.fill()
        }

        // Shockwave rings
        ctx.globalAlpha = Math.max(0, 1 - age) * 0.85
        ctx.strokeStyle = p.color
        ctx.lineWidth = 4 - age * 2.5
        ctx.beginPath()
        ctx.arc(p.x, p.y, 8 + age * 58, 0, Math.PI * 2)
        ctx.stroke()
        ctx.strokeStyle = p.shade
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(p.x, p.y, 4 + age * 78, 0, Math.PI * 2)
        ctx.stroke()

        // Star-burst rays
        ctx.globalAlpha = Math.max(0, 0.9 - age * 1.2)
        for (let i = 0; i < 10; i += 1) {
          const a = (Math.PI * 2 * i) / 10 + age * 0.4
          const len = 18 + age * 42 + (i % 2) * 10
          ctx.strokeStyle = i % 2 === 0 ? p.color : '#fff7ed'
          ctx.lineWidth = 2.2
          ctx.beginPath()
          ctx.moveTo(p.x + Math.cos(a) * 4, p.y + Math.sin(a) * 4)
          ctx.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      for (const s of shardsRef.current) {
        const t = (now - s.born) / s.life
        const px = s.x + s.vx * t * 95
        const py = s.y + s.vy * t * 95 + t * t * 55
        const rot = s.rot + s.spin * t
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(rot)
        ctx.globalAlpha = Math.max(0, 1 - t * t)
        ctx.fillStyle = s.color
        if (s.kind === 'scrap') {
          ctx.beginPath()
          ctx.moveTo(-s.r * 1.6, -s.r * 0.35)
          ctx.quadraticCurveTo(0, -s.r * 0.9, s.r * 1.8, -s.r * 0.2)
          ctx.quadraticCurveTo(s.r * 0.2, s.r * 0.7, -s.r * 1.4, s.r * 0.45)
          ctx.closePath()
          ctx.fill()
        } else if (s.kind === 'spark') {
          ctx.beginPath()
          for (let k = 0; k < 4; k += 1) {
            const a = (Math.PI / 2) * k
            ctx.lineTo(Math.cos(a) * s.r, Math.sin(a) * s.r)
            ctx.lineTo(
              Math.cos(a + Math.PI / 4) * s.r * 0.35,
              Math.sin(a + Math.PI / 4) * s.r * 0.35,
            )
          }
          ctx.closePath()
          ctx.fill()
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, s.r * (1 - t * 0.35), 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, recordTrial, syncSize])

  const spawnPopFx = (x: number, y: number, color: Balloon['color']) => {
    const now = performance.now()
    popsRef.current.push({
      x,
      y,
      born: now,
      color: color.body,
      shade: color.shade,
    })
    for (let i = 0; i < 12; i += 1) {
      const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.35
      const speed = 0.9 + Math.random() * 1.6
      shardsRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.55,
        r: 4 + Math.random() * 5,
        color: Math.random() < 0.55 ? color.body : color.shade,
        born: now,
        life: 420 + Math.random() * 280,
        kind: 'scrap',
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 8,
      })
    }
    for (let i = 0; i < 16; i += 1) {
      const angle = Math.random() * Math.PI * 2
      const speed = 0.5 + Math.random() * 1.8
      shardsRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.7,
        r: 1.8 + Math.random() * 3.2,
        color:
          Math.random() < 0.35
            ? '#fff7ed'
            : Math.random() < 0.5
              ? color.highlight
              : color.body,
        born: now,
        life: 280 + Math.random() * 260,
        kind: Math.random() < 0.4 ? 'spark' : 'dot',
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 10,
      })
    }
  }

  const onTap = useCallback(
    (clientX: number, clientY: number) => {
      if (!running) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const hit = [...balloonsRef.current].reverse().find((b) => {
        const age = performance.now() - b.born
        const bob = Math.sin(age * 0.004 + b.sway) * 6
        const lift = -(age / b.ttl) * b.rise
        const cx = b.x + Math.sin(age * 0.003 + b.sway) * 5
        const cy = b.y + bob + lift
        return Math.hypot(cx - x, cy - y) <= b.r + 10
      })
      if (!hit) return

      balloonsRef.current = balloonsRef.current.filter((b) => b.id !== hit.id)
      const age = performance.now() - hit.born
      const bob = Math.sin(age * 0.004 + hit.sway) * 6
      const lift = -(age / hit.ttl) * hit.rise
      const cx = hit.x + Math.sin(age * 0.003 + hit.sway) * 5
      const cy = hit.y + bob + lift
      spawnPopFx(cx, cy, hit.color)
      recordTrial('hit', performance.now() - hit.born, 1)
      setScore((s) => {
        const hits = s.hits + 1
        if (hits > 0 && hits % 8 === 0) {
          spawnGapRef.current = Math.max(1050, spawnGapRef.current - 35)
          ttlBaseRef.current = Math.max(2700, ttlBaseRef.current - 60)
          setMessage('稍稍快一点啦，继续盯中间、扎周边～')
        } else {
          setMessage('砰！爆开啦～再扎一个！')
        }
        return { ...s, hits }
      })
      playTone('pop')
    },
    [running, recordTrial],
  )

  const accuracy =
    score.hits + score.misses === 0
      ? 0
      : Math.round((score.hits / (score.hits + score.misses)) * 100)

  return (
    <GameShell title="扎气球" subtitle="周边反应 · 砰一声好解压">
      <BalloonBody
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
          const ability = getGameAbility('bubbleRush')
          balloonsRef.current = []
          popsRef.current = []
          shardsRef.current = []
          spawnGapRef.current = bubbleSpawnGapForLevel(ability.level)
          ttlBaseRef.current = bubbleTtlForLevel(ability.level)
          setScore({ hits: 0, misses: 0 })
          spawnAtRef.current = performance.now() + 900
          setMessage('盯住中间十字，四周气球飘来就扎破')
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

function BalloonBody({
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
  const stageRef = useRef<HTMLDivElement>(null)
  const [needle, setNeedle] = useState<{
    x: number
    y: number
    show: boolean
    stab: boolean
  }>({ x: 0, y: 0, show: false, stab: false })
  const stabTimerRef = useRef(0)

  useEffect(() => {
    return () => window.clearTimeout(stabTimerRef.current)
  }, [])

  const moveNeedle = (clientX: number, clientY: number) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    setNeedle((n) => ({
      ...n,
      x: clientX - rect.left,
      y: clientY - rect.top,
      show: true,
    }))
  }

  const poke = (clientX: number, clientY: number) => {
    moveNeedle(clientX, clientY)
    setNeedle((n) => ({ ...n, stab: true, show: true }))
    window.clearTimeout(stabTimerRef.current)
    stabTimerRef.current = window.setTimeout(() => {
      setNeedle((n) => ({ ...n, stab: false }))
    }, 140)
    onTap(clientX, clientY)
  }

  return (
    <div
      className={
        isFullscreen
          ? 'flex min-h-0 flex-1 flex-col'
          : 'mx-auto flex w-full max-w-4xl flex-col px-4 py-4 sm:px-6'
      }
    >
      <GameHud>
        <GameHudStat label="扎破" value={`${score.hits}`} />
        <GameHudStat label="漏掉" value={`${score.misses}`} />
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
        className={
          isFullscreen
            ? 'bg-sky-100'
            : 'bg-sky-50 shadow ring-1 ring-amber-100'
        }
        onResize={onResize}
      >
        <div
          ref={stageRef}
          className="absolute inset-0"
          style={{
            cursor: running
              ? needle.show
                ? 'none'
                : NEEDLE_CURSOR
              : 'default',
          }}
          onPointerEnter={(e) => {
            if (!running) return
            moveNeedle(e.clientX, e.clientY)
          }}
          onPointerLeave={() =>
            setNeedle((n) => ({ ...n, show: false, stab: false }))
          }
          onPointerMove={(e) => {
            if (!running) return
            moveNeedle(e.clientX, e.clientY)
          }}
          onPointerDown={(e) => {
            if (!running) return
            e.preventDefault()
            poke(e.clientX, e.clientY)
          }}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-none"
            style={{ cursor: 'inherit' }}
          />
          {running && needle.show && (
            <NeedlePointer x={needle.x} y={needle.y} stab={needle.stab} />
          )}
        </div>
      </CanvasStage>

      <GameControls>
        {!running ? (
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-rose-500 px-6 py-3 font-extrabold text-white"
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

/** On-canvas needle that tracks the pointer (tip = hotspot). */
function NeedlePointer({
  x,
  y,
  stab,
}: {
  x: number
  y: number
  stab: boolean
}) {
  return (
    <div
      className="pointer-events-none absolute z-10"
      style={{
        left: x,
        top: y,
        transform: stab
          ? 'translate(-6px, -6px) rotate(-28deg) scale(0.92) translateY(6px)'
          : 'translate(-6px, -6px) rotate(-28deg)',
        transition: stab ? 'transform 80ms ease-out' : 'transform 40ms linear',
        filter: 'drop-shadow(0 1px 1px rgba(15,23,42,0.35))',
      }}
      aria-hidden
    >
      <svg width="44" height="44" viewBox="0 0 40 40" fill="none">
        <defs>
          <linearGradient id="needleShaft" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="45%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
        </defs>
        <line
          x1="6"
          y1="6"
          x2="28"
          y2="30"
          stroke="url(#needleShaft)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <polygon
          points="6,6 12,7.8 7.8,12"
          fill="#e2e8f0"
          stroke="#64748b"
          strokeWidth="0.7"
        />
        <circle
          cx="30.5"
          cy="32.5"
          r="5.2"
          fill="#f43f5e"
          stroke="#9f1239"
          strokeWidth="1.3"
        />
        <circle cx="29" cy="31" r="1.7" fill="#fecdd3" />
      </svg>
    </div>
  )
}
