import { useCallback, useEffect, useRef, useState } from 'react'
import { useTrainingSession } from '../../hooks/useTrainingSession'
import {
  fellowContrastForLevel,
  getGameAbility,
} from '../../lib/abilityProfile'
import { playTone } from '../../lib/audio'
import { toBlueCss, toRedCss } from '../../lib/colorConfig'
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

type Eye = 'red' | 'blue'

interface Token {
  id: number
  x: number
  y: number
  r: number
  kind: 'treasure' | 'shadow'
  born: number
}

/**
 * Dichoptic contrast balance: amblyopic eye collects treasure; fellow eye sees faded shadows.
 */
export function ContrastBalanceGame() {
  const { begin, end, recordTrial, setClinical, locked } =
    useTrainingSession('contrastBalance')
  const redR = useColorConfigStore((s) => s.redR)
  const blueG = useColorConfigStore((s) => s.blueG)
  const blueB = useColorConfigStore((s) => s.blueB)
  const redCss = toRedCss(redR)
  const blueCss = toBlueCss(blueG, blueB)
  const { canvasRef, sizeRef, syncSize } = useStageCanvas()

  const tokensRef = useRef<Token[]>([])
  const idRef = useRef(1)
  const spawnAtRef = useRef(0)
  const countsRef = useRef({ redHits: 0, blueCollisions: 0 })
  const fellowRef = useRef(0.78)
  const amblyopicRef = useRef<Eye>('red')
  const streakRef = useRef(0)
  const rafRef = useRef(0)
  const runningRef = useRef(false)

  const [phase, setPhase] = useState<'pick' | 'play'>('pick')
  const [amblyopicEye, setAmblyopicEye] = useState<Eye>('red')
  const [running, setRunning] = useState(false)
  const [score, setScore] = useState({ hits: 0, misses: 0 })
  const [fellowContrast, setFellowContrast] = useState(0.78)
  const [message, setMessage] = useState('先选弱视眼：宝藏在那只眼睛里')

  runningRef.current = running

  const pushClinical = useCallback(() => {
    setClinical({
      fellowContrast: fellowRef.current,
      amblyopicEye: amblyopicRef.current,
      redHits: countsRef.current.redHits,
      blueCollisions: countsRef.current.blueCollisions,
      woreGlasses: true,
    })
  }, [setClinical])

  const channelCss = useCallback(
    (eye: Eye, contrast: number) => {
      if (eye === 'red') {
        const r = Math.round(redR * contrast)
        return `rgb(${r}, 0, 0)`
      }
      const g = Math.round(blueG * contrast)
      const b = Math.round(blueB * contrast)
      return `rgb(0, ${g}, ${b})`
    },
    [redR, blueG, blueB],
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
    spawnAtRef.current = performance.now() + 500

    const loop = (now: number) => {
      const { w, h } = sizeRef.current
      const amb = amblyopicRef.current
      const fellow: Eye = amb === 'red' ? 'blue' : 'red'

      if (now >= spawnAtRef.current) {
        const treasure = Math.random() < 0.58
        tokensRef.current.push({
          id: idRef.current++,
          x: 40 + Math.random() * Math.max(10, w - 80),
          y: 50 + Math.random() * Math.max(10, h - 100),
          r: treasure ? 24 + Math.random() * 10 : 20 + Math.random() * 12,
          kind: treasure ? 'treasure' : 'shadow',
          born: now,
        })
        spawnAtRef.current = now + 850 + Math.random() * 700
      }
      tokensRef.current = tokensRef.current.filter((t) => now - t.born < 3400)

      ctx.fillStyle = '#0a0f1a'
      ctx.fillRect(0, 0, w, h)

      // Balance meter
      const meterW = Math.min(220, w * 0.5)
      const meterX = (w - meterW) / 2
      const meterY = 14
      const balance = 1 - fellowRef.current // higher = more challenge / fellow dimmer
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      roundRect(ctx, meterX, meterY, meterW, 14, 7)
      ctx.fill()
      ctx.fillStyle = amb === 'red' ? redCss : blueCss
      roundRect(ctx, meterX, meterY, meterW * Math.min(1, Math.max(0.08, balance)), 14, 7)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.font = 'bold 11px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('天平：健眼变淡 →', w / 2, meterY + 28)

      for (const t of tokensRef.current) {
        if (t.kind === 'treasure') {
          ctx.fillStyle = channelCss(amb, 1)
          drawGem(ctx, t.x, t.y, t.r)
        } else {
          ctx.fillStyle = channelCss(fellow, fellowRef.current)
          drawShadow(ctx, t.x, t.y, t.r)
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, canvasRef, sizeRef, syncSize, channelCss, redCss, blueCss])

  const onTap = useCallback(
    (clientX: number, clientY: number) => {
      if (!runningRef.current) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const hit = [...tokensRef.current]
        .reverse()
        .find((t) => Math.hypot(t.x - x, t.y - y) <= t.r + 8)
      if (!hit) return
      tokensRef.current = tokensRef.current.filter((t) => t.id !== hit.id)

      if (hit.kind === 'treasure') {
        // BCI convention: redHits = amblyopic-eye successes (regardless of filter color)
        countsRef.current.redHits += 1
        recordTrial('hit', performance.now() - hit.born, 1)
        streakRef.current += 1
        setScore((s) => ({ ...s, hits: s.hits + 1 }))
        playTone('success')
        setMessage('宝藏到手！弱视眼在使劲')
        if (streakRef.current >= 3) {
          fellowRef.current = Math.max(0.28, fellowRef.current - 0.05)
          setFellowContrast(fellowRef.current)
          streakRef.current = 0
          setMessage('天平倾斜：健眼更淡了')
        }
        pushClinical()
      } else {
        countsRef.current.blueCollisions += 1
        recordTrial('miss', null, 0)
        streakRef.current = 0
        setScore((s) => ({ ...s, misses: s.misses + 1 }))
        playTone('error')
        fellowRef.current = Math.min(0.95, fellowRef.current + 0.04)
        setFellowContrast(fellowRef.current)
        setMessage('躲开影子～那是另一只眼睛的干扰')
        pushClinical()
      }
    },
    [canvasRef, recordTrial, pushClinical],
  )

  const accuracy =
    score.hits + score.misses === 0
      ? 0
      : Math.round((score.hits / (score.hits + score.misses)) * 100)

  const startPlay = (eye: Eye) => {
    if (!begin()) {
      setMessage('今日训练时间已用完')
      return
    }
    const ability = getGameAbility('contrastBalance')
    const startFellow = fellowContrastForLevel(ability.level)
    amblyopicRef.current = eye
    setAmblyopicEye(eye)
    fellowRef.current = startFellow
    setFellowContrast(startFellow)
    tokensRef.current = []
    countsRef.current = { redHits: 0, blueCollisions: 0 }
    streakRef.current = 0
    setScore({ hits: 0, misses: 0 })
    setPhase('play')
    setRunning(true)
    setMessage(
      eye === 'red'
        ? '红眼找宝藏，躲开蓝影子'
        : '蓝眼找宝藏，躲开红影子',
    )
    setClinical({
      amblyopicEye: eye,
      fellowContrast: startFellow,
      redHits: 0,
      blueCollisions: 0,
      woreGlasses: true,
    })
    playTone('tick')
    requestAnimationFrame(syncSize)
  }

  return (
    <GameShell title="红蓝天平" subtitle="对比度平衡 · 需红蓝眼镜">
      <BalanceBody
        canvasRef={canvasRef}
        phase={phase}
        running={running}
        score={score}
        accuracy={accuracy}
        fellowContrast={fellowContrast}
        amblyopicEye={amblyopicEye}
        message={message}
        redCss={redCss}
        blueCss={blueCss}
        onResize={syncSize}
        onTap={onTap}
        onPickEye={(eye) => {
          setAmblyopicEye(eye)
          setMessage(eye === 'red' ? '已选红眼为弱视眼' : '已选蓝眼为弱视眼')
          startPlay(eye)
        }}
        onEnd={() => {
          setRunning(false)
          pushClinical()
          void end({ save: true })
          setPhase('pick')
          setMessage('已保存本局记录')
        }}
      />
    </GameShell>
  )
}

function BalanceBody(props: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  phase: 'pick' | 'play'
  running: boolean
  score: { hits: number; misses: number }
  accuracy: number
  fellowContrast: number
  amblyopicEye: Eye
  message: string
  redCss: string
  blueCss: string
  onResize: () => void
  onTap: (x: number, y: number) => void
  onPickEye: (eye: Eye) => void
  onEnd: () => void
}) {
  const { isFullscreen } = useGameShell()
  const {
    canvasRef,
    phase,
    running,
    score,
    accuracy,
    fellowContrast,
    amblyopicEye,
    message,
    redCss,
    blueCss,
    onResize,
    onTap,
    onPickEye,
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
        <GameHudStat label="宝藏" value={`${score.hits}`} />
        <GameHudStat label="准确率" value={`${accuracy}%`} />
        <GameHudStat
          label="健眼对比"
          value={`${Math.round(fellowContrast * 100)}%`}
        />
        {running && (
          <GameHudStat
            label="弱视眼"
            value={amblyopicEye === 'red' ? '红' : '蓝'}
          />
        )}
        {isFullscreen && (
          <p className="ml-auto self-center text-xs font-bold text-white/70">{message}</p>
        )}
      </GameHud>
      {!isFullscreen && (
        <p className="mb-2 text-center text-sm font-extrabold text-slate-700">{message}</p>
      )}

      {phase === 'pick' && !running ? (
        <div
          className={
            isFullscreen
              ? 'relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4'
              : 'mb-4 flex flex-col items-center gap-4 rounded-3xl bg-slate-900 px-4 py-10'
          }
        >
          <p className="text-center text-base font-extrabold text-white">
            哪只眼睛是弱视眼？（宝藏会出现在这只眼睛）
          </p>
          <div className="flex w-full max-w-md gap-3">
            <button
              type="button"
              onClick={() => onPickEye('red')}
              className="min-h-16 flex-1 rounded-2xl text-lg font-extrabold text-white"
              style={{ background: redCss }}
            >
              红眼（左）
            </button>
            <button
              type="button"
              onClick={() => onPickEye('blue')}
              className="min-h-16 flex-1 rounded-2xl text-lg font-extrabold text-white"
              style={{ background: blueCss }}
            >
              蓝眼（右）
            </button>
          </div>
        </div>
      ) : (
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
      )}

      <GameControls>
        {running ? (
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
        ) : phase === 'pick' ? null : (
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-rose-500 px-6 py-3 font-extrabold text-white"
            onClick={() => onPickEye(amblyopicEye)}
          >
            再玩一局
          </button>
        )}
      </GameControls>
    </div>
  )
}

function drawGem(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx + r * 0.85, cy - r * 0.15)
  ctx.lineTo(cx + r * 0.55, cy + r * 0.75)
  ctx.lineTo(cx - r * 0.55, cy + r * 0.75)
  ctx.lineTo(cx - r * 0.85, cy - r * 0.15)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath()
  ctx.ellipse(cx, cy, r * 1.1, r * 0.7, 0, 0, Math.PI * 2)
  ctx.fill()
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
