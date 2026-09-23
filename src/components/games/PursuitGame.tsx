import { useCallback, useEffect, useRef, useState } from 'react'
import { useTrainingSession } from '../../hooks/useTrainingSession'
import {
  getGameAbility,
  pursuitSpeedForLevel,
} from '../../lib/abilityProfile'
import { playTone } from '../../lib/audio'
import { fillCheckerboard } from '../../lib/grating'
import { useStageCanvas } from '../../hooks/useStageCanvas'
import { CanvasStage } from '../CanvasStage'
import {
  GameControls,
  GameHud,
  GameHudStat,
  GameShell,
  useGameShell,
} from '../GameShell'

type PathMode = 'lissajous' | 'circle' | 'figure8'

export function PursuitGame() {
  const { begin, end, recordTrial, locked } = useTrainingSession('pursuit')
  const { canvasRef, sizeRef, syncSize } = useStageCanvas()
  const pointerRef = useRef({ x: 0, y: 0, active: false })
  const targetRef = useRef({ x: 200, y: 200, t: 0 })
  const rafRef = useRef(0)
  const onTargetAccRef = useRef(0)
  const sampleAccRef = useRef(0)
  const lastSampleRef = useRef(0)
  const speedMulRef = useRef(1)
  const pathModeRef = useRef<PathMode>('lissajous')
  const trailRef = useRef<Array<{ x: number; y: number }>>([])
  const offAccRef = useRef(0)

  const [running, setRunning] = useState(false)
  const [hud, setHud] = useState({
    score: 0,
    onTargetPct: 0,
    message: '点开始，用手指跟着蝴蝶飞',
  })

  useEffect(() => {
    if (locked && running) {
      setRunning(false)
      void end({ save: true })
      setHud((h) => ({ ...h, message: '今日训练时间到，先休息～' }))
    }
  }, [locked, running, end])

  useEffect(() => {
    if (!running) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    syncSize()

    let last = performance.now()
    let hudTick = 0
    const mode = pathModeRef.current
    const speedMul = speedMulRef.current

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const { w, h } = sizeRef.current
      const t = (targetRef.current.t += dt * speedMul)

      if (mode === 'circle') {
        targetRef.current.x = w * 0.5 + Math.cos(t * 0.9) * w * 0.28
        targetRef.current.y = h * 0.5 + Math.sin(t * 0.9) * h * 0.26
      } else if (mode === 'figure8') {
        targetRef.current.x = w * 0.5 + Math.sin(t * 0.7) * w * 0.3
        targetRef.current.y = h * 0.5 + Math.sin(t * 1.4) * h * 0.22
      } else {
        targetRef.current.x = w * 0.5 + Math.sin(t * 0.55) * w * 0.28
        targetRef.current.y = h * 0.5 + Math.sin(t * 0.38 + 1.2) * h * 0.24
      }

      const dist = Math.hypot(
        pointerRef.current.x - targetRef.current.x,
        pointerRef.current.y - targetRef.current.y,
      )
      const onTarget = pointerRef.current.active && dist < 56
      if (!onTarget && pointerRef.current.active) {
        offAccRef.current += dt
        if (offAccRef.current > 0.9) {
          targetRef.current.t -= dt * speedMul * 0.55
          offAccRef.current = 0.5
        }
      } else {
        offAccRef.current = 0
      }

      if (now - lastSampleRef.current > 280) {
        lastSampleRef.current = now
        sampleAccRef.current += 1
        if (onTarget) {
          onTargetAccRef.current += 1
          recordTrial('hit', null, 1)
        } else if (pointerRef.current.active) {
          recordTrial('miss', null, 0)
        }
      }

      trailRef.current.push({
        x: targetRef.current.x,
        y: targetRef.current.y,
      })
      if (trailRef.current.length > 18) trailRef.current.shift()

      fillCheckerboard(ctx, w, h, {
        cell: 28,
        colorA: '#e8f7ff',
        colorB: '#d2eefc',
        phaseX: t * 8,
        phaseY: t * 5,
        alpha: 1,
      })

      for (let i = 0; i < trailRef.current.length; i += 1) {
        const p = trailRef.current[i]!
        ctx.fillStyle = `rgba(16,185,129,${0.08 + (i / trailRef.current.length) * 0.25})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, 6 + i * 0.3, 0, Math.PI * 2)
        ctx.fill()
      }

      const wing = Math.sin(t * 14) * 0.35
      ctx.fillStyle = 'rgba(16,185,129,0.18)'
      ctx.beginPath()
      ctx.arc(targetRef.current.x, targetRef.current.y, 52, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#10b981'
      ctx.beginPath()
      ctx.ellipse(
        targetRef.current.x - 14,
        targetRef.current.y,
        18,
        11,
        -0.5 + wing,
        0,
        Math.PI * 2,
      )
      ctx.ellipse(
        targetRef.current.x + 14,
        targetRef.current.y,
        18,
        11,
        0.5 - wing,
        0,
        Math.PI * 2,
      )
      ctx.fill()
      ctx.fillStyle = '#34d399'
      ctx.beginPath()
      ctx.ellipse(
        targetRef.current.x - 14,
        targetRef.current.y,
        10,
        6,
        -0.5 + wing,
        0,
        Math.PI * 2,
      )
      ctx.ellipse(
        targetRef.current.x + 14,
        targetRef.current.y,
        10,
        6,
        0.5 - wing,
        0,
        Math.PI * 2,
      )
      ctx.fill()
      ctx.fillStyle = '#064e3b'
      ctx.beginPath()
      ctx.arc(targetRef.current.x, targetRef.current.y, 6, 0, Math.PI * 2)
      ctx.fill()

      if (pointerRef.current.active) {
        ctx.strokeStyle = onTarget ? '#059669' : '#f43f5e'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(pointerRef.current.x, pointerRef.current.y, 28, 0, Math.PI * 2)
        ctx.stroke()
      }

      hudTick += dt
      if (hudTick > 0.4) {
        hudTick = 0
        const pct =
          sampleAccRef.current === 0
            ? 0
            : Math.round((onTargetAccRef.current / sampleAccRef.current) * 100)
        setHud({
          score: onTargetAccRef.current,
          onTargetPct: pct,
          message: onTarget ? '跟得好！继续跟着飞～' : '把圆圈套在蝴蝶上',
        })
      }

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, recordTrial, syncSize, canvasRef, sizeRef])

  const setPointer = useCallback(
    (clientX: number, clientY: number, active: boolean) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      pointerRef.current = {
        x: clientX - rect.left,
        y: clientY - rect.top,
        active,
      }
    },
    [canvasRef],
  )

  return (
    <GameShell title="追蝴蝶" subtitle="追随运动 · 手指跟着目标">
      <PursuitBody
        canvasRef={canvasRef}
        running={running}
        hud={hud}
        onResize={syncSize}
        setPointer={setPointer}
        onPointerUp={() => {
          pointerRef.current.active = false
        }}
        onStart={() => {
          if (!begin()) {
            setHud((h) => ({ ...h, message: '今日训练时间已用完' }))
            return
          }
          const ability = getGameAbility('pursuit')
          speedMulRef.current = pursuitSpeedForLevel(ability.level)
          const modes: PathMode[] = ['lissajous', 'circle', 'figure8']
          pathModeRef.current = modes[Math.floor(Math.random() * modes.length)]!
          onTargetAccRef.current = 0
          sampleAccRef.current = 0
          offAccRef.current = 0
          trailRef.current = []
          targetRef.current.t = 0
          setHud({
            score: 0,
            onTargetPct: 0,
            message: '手指跟着蝴蝶飞，脱靶时它会等你一下',
          })
          setRunning(true)
          playTone('tick')
          requestAnimationFrame(syncSize)
        }}
        onEnd={() => {
          setRunning(false)
          void end({ save: true })
          setHud((h) => ({
            ...h,
            message:
              h.onTargetPct >= 60
                ? `贴合 ${h.onTargetPct}%，追随很稳！`
                : '已保存本局，多练几局会更跟得上',
          }))
        }}
      />
    </GameShell>
  )
}

function PursuitBody({
  canvasRef,
  running,
  hud,
  onResize,
  setPointer,
  onPointerUp,
  onStart,
  onEnd,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  running: boolean
  hud: { score: number; onTargetPct: number; message: string }
  onResize: () => void
  setPointer: (x: number, y: number, active: boolean) => void
  onPointerUp: () => void
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
        <GameHudStat label="贴合得分" value={`${hud.score}`} />
        <GameHudStat label="贴合率" value={`${hud.onTargetPct}%`} />
        {isFullscreen ? (
          <p className="ml-auto self-center text-xs font-bold text-white/70">
            {hud.message}
          </p>
        ) : (
          <GameHudStat label="提示" value={hud.message} />
        )}
      </GameHud>
      <CanvasStage className="bg-sky-50" onResize={onResize}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            setPointer(e.clientX, e.clientY, true)
          }}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse' && e.buttons === 0) return
            setPointer(e.clientX, e.clientY, true)
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') onPointerUp()
          }}
        />
      </CanvasStage>
      <GameControls>
        {!running ? (
          <button
            type="button"
            className="min-h-14 rounded-2xl bg-emerald-500 px-6 py-3 text-lg font-extrabold text-white"
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
