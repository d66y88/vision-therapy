import { useCallback, useEffect, useRef, useState } from 'react'
import { useTrainingSession } from '../../hooks/useTrainingSession'
import {
  getGameAbility,
  starPopRedBiasForLevel,
  starPopSpawnGapForLevel,
} from '../../lib/abilityProfile'
import { playTone } from '../../lib/audio'
import { toBlueCss, toRedCss } from '../../lib/colorConfig'
import { fillBwVerticalGrating } from '../../lib/grating'
import { useStageCanvas } from '../../hooks/useStageCanvas'
import { useColorConfigStore } from '../../store/colorConfigStore'
import { useTherapyProfileStore } from '../../store/therapyProfileStore'
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
  ttl: number
}

const WAVE_GOAL = 8

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
  const redBiasRef = useRef(0.62)
  const spawnGapRef = useRef(1000)
  const waveHitsRef = useRef(0)
  /** Amblyopic-eye channel = collect; fellow = avoid. */
  const targetKindRef = useRef<'red' | 'blue'>('red')
  const [running, setRunning] = useState(false)
  const [score, setScore] = useState({ hits: 0, misses: 0 })
  const [wave, setWave] = useState(1)
  const [message, setMessage] = useState('戴上红蓝眼镜：只戳弱视眼颜色的星')

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
    const targetKind = targetKindRef.current

    const loop = (now: number) => {
      const { w, h } = sizeRef.current
      if (now >= spawnAtRef.current) {
        let kind: 'red' | 'blue' =
          Math.random() < redBiasRef.current ? targetKind : targetKind === 'red' ? 'blue' : 'red'
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
          r: 24 + Math.random() * 12,
          kind,
          born: now,
          ttl: 2800 + Math.random() * 600,
        })
        spawnAtRef.current = now + spawnGapRef.current + Math.random() * 400
      }
      starsRef.current = starsRef.current.filter((s) => now - s.born < s.ttl)

      fillBwVerticalGrating(ctx, w, h, 26, (now * 0.012) % 80, 1)
      ctx.fillStyle = 'rgba(5,7,12,0.35)'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 4
      ctx.strokeRect(8, 8, w - 16, h - 16)

      for (const s of starsRef.current) {
        const age = now - s.born
        const fadeIn = Math.min(1, age / 180)
        const fadeOut = Math.min(1, (s.ttl - age) / 280)
        const pulse = 1 + Math.sin(age / 120) * 0.08
        const alpha = Math.max(0.15, fadeIn * fadeOut)
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.shadowColor = s.kind === 'red' ? redCss : blueCss
        ctx.shadowBlur = 14
        ctx.fillStyle = s.kind === 'red' ? redCss : blueCss
        drawStar(ctx, s.x, s.y, s.r * pulse * fadeIn)
        ctx.restore()
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
        .find((s) => Math.hypot(s.x - x, s.y - y) <= s.r + 10)
      if (!hit) return
      starsRef.current = starsRef.current.filter((s) => s.id !== hit.id)
      const targetKind = targetKindRef.current
      if (hit.kind === targetKind) {
        countsRef.current.redHits += 1
        waveHitsRef.current += 1
        recordTrial('hit', performance.now() - hit.born, 1)
        setClinical({
          redHits: countsRef.current.redHits,
          blueCollisions: countsRef.current.blueCollisions,
          amblyopicEye: targetKind,
          woreGlasses: true,
        })
        setScore((s) => {
          const hits = s.hits + 1
          const total = hits + s.misses
          const acc = total === 0 ? 1 : hits / total
          redBiasRef.current = Math.min(0.78, Math.max(0.48, 0.55 + acc * 0.2))
          return { ...s, hits }
        })
        playTone('success')
        if (waveHitsRef.current >= WAVE_GOAL) {
          waveHitsRef.current = 0
          setWave((w) => w + 1)
          spawnGapRef.current = Math.max(520, spawnGapRef.current - 80)
          setMessage('过关！下一波更快一点点～')
        } else {
          setMessage(`真棒！本波再收 ${WAVE_GOAL - waveHitsRef.current} 颗`)
        }
      } else {
        countsRef.current.blueCollisions += 1
        recordTrial('miss', null, 0)
        setClinical({
          redHits: countsRef.current.redHits,
          blueCollisions: countsRef.current.blueCollisions,
          amblyopicEye: targetKind,
          woreGlasses: true,
        })
        setScore((s) => ({ ...s, misses: s.misses + 1 }))
        spawnGapRef.current = Math.min(1400, spawnGapRef.current + 60)
        redBiasRef.current = Math.min(0.8, redBiasRef.current + 0.03)
        playTone('error')
        setMessage('慢慢来，另一只眼睛的星躲开就好～')
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
        wave={wave}
        message={message}
        onResize={syncSize}
        onTap={onTap}
        onStart={() => {
          if (!begin()) {
            setMessage('今日训练时间已用完')
            return
          }
          const ability = getGameAbility('starPop')
          const eye = useTherapyProfileStore.getState().amblyopicEye
          targetKindRef.current = eye
          starsRef.current = []
          countsRef.current = { redHits: 0, blueCollisions: 0 }
          lastKindsRef.current = []
          redBiasRef.current = starPopRedBiasForLevel(ability.level)
          spawnGapRef.current = starPopSpawnGapForLevel(ability.level)
          waveHitsRef.current = 0
          setWave(1)
          setScore({ hits: 0, misses: 0 })
          spawnAtRef.current = 0
          setClinical({ amblyopicEye: eye, woreGlasses: true })
          setMessage(
            eye === 'red'
              ? '第 1 波：只戳红星（弱视眼），躲开蓝星'
              : '第 1 波：只戳蓝星（弱视眼），躲开红星',
          )
          setRunning(true)
          playTone('tick')
          requestAnimationFrame(syncSize)
        }}
        onEnd={() => {
          setRunning(false)
          void end({ save: true })
          setMessage(
            accuracy >= 70
              ? `第 ${wave} 波，准确 ${accuracy}%——双眼配合不错！`
              : '已保存本局，戴稳眼镜再练会更好',
          )
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
  wave: number
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
    wave,
    message,
    onResize,
    onTap,
    onStart,
    onEnd,
  } = props
  return (
    <div className={isFullscreen ? 'flex min-h-0 flex-1 flex-col' : 'mx-auto flex w-full max-w-4xl flex-col px-4 py-4 sm:px-6'}>
      <GameHud>
        <GameHudStat label="收集" value={`${score.hits}`} />
        <GameHudStat label="波次" value={`${wave}`} />
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
          <button type="button" className="min-h-14 rounded-2xl bg-rose-500 px-6 py-3 text-lg font-extrabold text-white" onClick={onStart}>开始训练</button>
        ) : (
          <button type="button" className={isFullscreen ? 'min-h-12 rounded-2xl bg-white px-6 py-3 font-extrabold text-slate-900' : 'min-h-14 rounded-2xl bg-white px-6 py-3 text-lg font-extrabold text-slate-700 ring-1 ring-slate-200'} onClick={onEnd}>结束并保存</button>
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
    const x2 = cx + Math.cos(b) * (r * 0.42)
    const y2 = cy + Math.sin(b) * (r * 0.42)
    if (i === 0) ctx.moveTo(x1, y1)
    else ctx.lineTo(x1, y1)
    ctx.lineTo(x2, y2)
  }
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.arc(cx - r * 0.15, cy - r * 0.2, r * 0.22, 0, Math.PI * 2)
  ctx.fill()
}
