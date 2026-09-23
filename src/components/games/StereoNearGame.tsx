import { useCallback, useEffect, useRef, useState } from 'react'
import { useTrainingSession } from '../../hooks/useTrainingSession'
import {
  getGameAbility,
  stereoStartDisparityForLevel,
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

type Side = 'left' | 'right'

/**
 * Anaglyph near/far choice with disparity staircase (smaller px = harder).
 */
export function StereoNearGame() {
  const { begin, end, recordTrial, setClinical, locked } =
    useTrainingSession('stereoNear')
  const redCss = toRedCss(useColorConfigStore((s) => s.redR))
  const blueCss = toBlueCss(
    useColorConfigStore((s) => s.blueG),
    useColorConfigStore((s) => s.blueB),
  )
  const { canvasRef, sizeRef, syncSize } = useStageCanvas()

  const disparityRef = useRef(28)
  const nearerRef = useRef<Side>('left')
  const awaitingRef = useRef(false)
  const trialAtRef = useRef(0)
  const streakRef = useRef(0)
  const runningRef = useRef(false)

  const [running, setRunning] = useState(false)
  const [awaiting, setAwaiting] = useState(false)
  const [disparity, setDisparity] = useState(28)
  const [score, setScore] = useState({ hits: 0, misses: 0 })
  const [message, setMessage] = useState('戴上红蓝眼镜：哪个气球更近？')

  runningRef.current = running

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h } = sizeRef.current
    ctx.fillStyle = '#0b1220'
    ctx.fillRect(0, 0, w, h)

    // Subtle depth floor
    const grad = ctx.createLinearGradient(0, h * 0.55, 0, h)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(1, 'rgba(148,163,184,0.18)')
    ctx.fillStyle = grad
    ctx.fillRect(0, h * 0.55, w, h * 0.45)

    const d = disparityRef.current
    const nearer = nearerRef.current
    const leftCx = w * 0.3
    const rightCx = w * 0.7
    const cy = h * 0.42
    const r = Math.min(w, h) * 0.11

    const drawBalloon = (cx: number, halfDisp: number, scale: number) => {
      // Red (left eye) slightly left, cyan (right eye) slightly right for uncrossed;
      // crossed (near) = reverse: red right of cyan → fused image in front.
      const redX = cx + halfDisp
      const blueX = cx - halfDisp
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = redCss
      balloonPath(ctx, redX, cy, r * scale)
      ctx.fill()
      ctx.fillStyle = blueCss
      balloonPath(ctx, blueX, cy, r * scale)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      // String visible to both
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx, cy + r * scale)
      ctx.lineTo(cx, cy + r * scale + 48)
      ctx.stroke()
    }

    // Nearer gets larger crossed disparity; farther gets small / zero
    const nearHalf = d / 2
    const farHalf = Math.max(1, d * 0.15)
    if (nearer === 'left') {
      drawBalloon(leftCx, nearHalf, 1.05)
      drawBalloon(rightCx, farHalf, 0.92)
    } else {
      drawBalloon(leftCx, farHalf, 0.92)
      drawBalloon(rightCx, nearHalf, 1.05)
    }

    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = `bold ${Math.max(14, Math.round(w * 0.035))}px system-ui`
    ctx.textAlign = 'center'
    ctx.fillText('哪个更近？', w / 2, h * 0.12)
  }, [canvasRef, sizeRef, redCss, blueCss])

  const nextTrial = useCallback(() => {
    nearerRef.current = Math.random() < 0.5 ? 'left' : 'right'
    trialAtRef.current = performance.now()
    awaitingRef.current = true
    setAwaiting(true)
    setDisparity(disparityRef.current)
    setClinical({ finalDisparityPx: disparityRef.current })
    requestAnimationFrame(() => {
      syncSize()
      drawScene()
    })
  }, [drawScene, syncSize, setClinical])

  useEffect(() => {
    if (locked && running) {
      setRunning(false)
      runningRef.current = false
      awaitingRef.current = false
      setAwaiting(false)
      void end({ save: true })
      setMessage('今日训练时间到，先休息～')
    }
  }, [locked, running, end])

  useEffect(() => {
    if (!running) return
    syncSize()
    drawScene()
  }, [running, syncSize, drawScene, disparity, redCss, blueCss])

  const answer = (choice: Side) => {
    if (!runningRef.current || !awaitingRef.current) return
    awaitingRef.current = false
    setAwaiting(false)
    const rt = performance.now() - trialAtRef.current
    const correct = choice === nearerRef.current
    if (correct) {
      streakRef.current += 1
      recordTrial('hit', rt, 1)
      playTone('success')
      setScore((s) => ({ ...s, hits: s.hits + 1 }))
      if (streakRef.current >= 2) {
        disparityRef.current = Math.max(8, disparityRef.current - 3)
        streakRef.current = 0
        setMessage('更难一点点：视差变小了')
      } else {
        setMessage('答对啦！')
      }
    } else {
      streakRef.current = 0
      recordTrial('miss', rt, 0)
      playTone('error')
      setScore((s) => ({ ...s, misses: s.misses + 1 }))
      disparityRef.current = Math.min(48, disparityRef.current + 4)
      setMessage('再戴稳眼镜看一看～')
    }
    setDisparity(disparityRef.current)
    setClinical({ finalDisparityPx: disparityRef.current })
    window.setTimeout(() => {
      if (runningRef.current) nextTrial()
    }, 900)
  }

  const accuracy =
    score.hits + score.misses === 0
      ? 0
      : Math.round((score.hits / (score.hits + score.misses)) * 100)

  return (
    <GameShell title="谁更近" subtitle="立体视 · 需红蓝眼镜">
      <StereoBody
        canvasRef={canvasRef}
        running={running}
        awaiting={awaiting}
        score={score}
        accuracy={accuracy}
        disparity={disparity}
        message={message}
        onResize={() => {
          syncSize()
          if (running) drawScene()
        }}
        onAnswer={answer}
        onStart={() => {
          if (!begin()) {
            setMessage('今日训练时间已用完')
            return
          }
          const ability = getGameAbility('stereoNear')
          const start = stereoStartDisparityForLevel(ability.level)
          disparityRef.current = start
          streakRef.current = 0
          setDisparity(start)
          setScore({ hits: 0, misses: 0 })
          setClinical({ finalDisparityPx: start, woreGlasses: true })
          setRunning(true)
          setMessage('戴上红蓝眼镜：哪个气球更近？')
          playTone('tick')
          requestAnimationFrame(() => {
            syncSize()
            nextTrial()
          })
        }}
        onEnd={() => {
          setRunning(false)
          awaitingRef.current = false
          setAwaiting(false)
          setClinical({ finalDisparityPx: disparityRef.current })
          void end({ save: true })
          setMessage('已保存本局记录')
        }}
      />
    </GameShell>
  )
}

function StereoBody(props: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  running: boolean
  awaiting: boolean
  score: { hits: number; misses: number }
  accuracy: number
  disparity: number
  message: string
  onResize: () => void
  onAnswer: (s: Side) => void
  onStart: () => void
  onEnd: () => void
}) {
  const { isFullscreen } = useGameShell()
  const {
    canvasRef,
    running,
    awaiting,
    score,
    accuracy,
    disparity,
    message,
    onResize,
    onAnswer,
    onStart,
    onEnd,
  } = props
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
        <GameHudStat label="视差" value={`${disparity}px`} />
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
        />
      </CanvasStage>
      <div className={`mx-auto grid w-full max-w-md grid-cols-2 gap-3 ${isFullscreen ? 'py-3' : 'mt-3'}`}>
        <button
          type="button"
          disabled={!canAnswer}
          onClick={() => onAnswer('left')}
          className="min-h-14 rounded-2xl bg-rose-500 text-lg font-extrabold text-white disabled:opacity-40"
        >
          左边更近
        </button>
        <button
          type="button"
          disabled={!canAnswer}
          onClick={() => onAnswer('right')}
          className="min-h-14 rounded-2xl bg-sky-500 text-lg font-extrabold text-white disabled:opacity-40"
        >
          右边更近
        </button>
      </div>
      <GameControls>
        {!running ? (
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-indigo-500 px-6 py-3 font-extrabold text-white"
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

function balloonPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath()
  ctx.ellipse(cx, cy, r * 0.85, r, 0, 0, Math.PI * 2)
  ctx.moveTo(cx, cy + r * 0.85)
  ctx.lineTo(cx - r * 0.18, cy + r * 1.15)
  ctx.lineTo(cx + r * 0.18, cy + r * 1.15)
  ctx.closePath()
}
