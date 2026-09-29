import { useCallback, useEffect, useRef, useState } from 'react'
import { useTrainingSession } from '../hooks/useTrainingSession'
import {
  getGameAbility,
  gaborPatchSizeForLevel,
  gaborStartContrastForLevel,
} from '../lib/abilityProfile'
import { playTone } from '../lib/audio'
import { fitCanvasToParent } from '../lib/fitCanvas'
import {
  fillNoiseImageData,
  GABOR_LIMITS,
  renderGaborImageData,
} from '../lib/gabor'
import {
  createInitialStaircase,
  randomizeOrientation,
  updateStaircase,
  type StaircaseState,
  type ThresholdSample,
} from '../lib/staircase'
import { CanvasStage } from './CanvasStage'
import {
  GameControls,
  GameHud,
  GameHudStat,
  GameShell,
  useGameShell,
} from './GameShell'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
  size: number
}

interface PatchPlacement {
  pixelX: number
  pixelY: number
  size: number
  gridX: number
  gridY: number
}

interface HudState {
  contrast: number
  spatialFrequency: number
  remainingMs: number
  message: string
}

const GRID = 4
/** Default drawn patch size; overridden per session by ability level. */
const PATCH_SIZE_DEFAULT = 40
const CONFETTI_COLORS = ['#ff8a6b', '#ffd56b', '#7ddea5', '#7ec8e3', '#f472b6']
/** Refresh noise every trial so backdrop stays clearly speckled. */
const NOISE_REFRESH_EVERY = 1

function spawnConfetti(x: number, y: number): Particle[] {
  return Array.from({ length: 28 }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = 2 + Math.random() * 5
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 0.7 + Math.random() * 0.5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 3 + Math.random() * 4,
    }
  })
}

function pickPatchPlacement(
  width: number,
  height: number,
  patchSize: number,
  exclude?: { gridX: number; gridY: number } | null,
): PatchPlacement {
  const cellW = width / GRID
  const cellH = height / GRID
  const cells: { gridX: number; gridY: number }[] = []
  for (let gx = 0; gx < GRID; gx += 1) {
    for (let gy = 0; gy < GRID; gy += 1) {
      if (exclude && exclude.gridX === gx && exclude.gridY === gy) continue
      cells.push({ gridX: gx, gridY: gy })
    }
  }
  const pool = cells.length > 0 ? cells : [{ gridX: 0, gridY: 0 }]
  const pick = pool[Math.floor(Math.random() * pool.length)]!
  const size = Math.min(patchSize, Math.max(24, Math.floor(Math.min(cellW, cellH) * 0.72)))
  return {
    pixelX: pick.gridX * cellW + (cellW - size) / 2,
    pixelY: pick.gridY * cellH + (cellH - size) / 2,
    size,
    gridX: pick.gridX,
    gridY: pick.gridY,
  }
}

export function GaborGame() {
  const { begin, end, recordTrial, setClinical, locked } =
    useTrainingSession('gabor')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const patchCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const patchSizeRef = useRef(PATCH_SIZE_DEFAULT)
  const staircaseRef = useRef<StaircaseState>(createInitialStaircase())
  const placementRef = useRef<PatchPlacement | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const trialStartedAtRef = useRef(0)
  const awaitingRef = useRef(false)
  const runningRef = useRef(false)
  const rafRef = useRef(0)
  const viewSizeRef = useRef({ w: 640, h: 420 })
  const trialCountRef = useRef(0)
  const noiseReadyRef = useRef(false)
  const reversalsRef = useRef(0)

  const [running, setRunning] = useState(false)
  const [score, setScore] = useState({ hits: 0, misses: 0, streak: 0 })
  const [samples, setSamples] = useState<ThresholdSample[]>([])
  void samples
  const [hud, setHud] = useState<HudState>(() => ({
    contrast: staircaseRef.current.stimulus.contrast,
    spatialFrequency: staircaseRef.current.stimulus.spatialFrequency,
    remainingMs: GABOR_LIMITS.responseMs,
    message: '点「开始训练」找条纹斑点！',
  }))

  runningRef.current = running

  const syncHud = useCallback((message?: string, remainingMs?: number) => {
    const s = staircaseRef.current.stimulus
    setHud((prev) => ({
      contrast: s.contrast,
      spatialFrequency: s.spatialFrequency,
      remainingMs: remainingMs ?? prev.remainingMs,
      message: message ?? prev.message,
    }))
  }, [])

  const ensureOffscreens = useCallback((w: number, h: number) => {
    if (!noiseCanvasRef.current) {
      noiseCanvasRef.current = document.createElement('canvas')
    }
    const patchPx = patchSizeRef.current
    if (
      !patchCanvasRef.current ||
      patchCanvasRef.current.width !== patchPx ||
      patchCanvasRef.current.height !== patchPx
    ) {
      patchCanvasRef.current = document.createElement('canvas')
      patchCanvasRef.current.width = patchPx
      patchCanvasRef.current.height = patchPx
    }
    const noise = noiseCanvasRef.current
    if (noise.width !== w || noise.height !== h) {
      noise.width = w
      noise.height = h
      noiseReadyRef.current = false
    }
  }, [])

  const prepareTrial = useCallback(() => {
    const { w, h } = viewSizeRef.current
    ensureOffscreens(w, h)

    const noise = noiseCanvasRef.current!
    const noiseCtx = noise.getContext('2d')!
    const needNoise =
      !noiseReadyRef.current ||
      noise.width !== w ||
      noise.height !== h ||
      trialCountRef.current % NOISE_REFRESH_EVERY === 0
    if (needNoise) {
      if (noise.width !== w || noise.height !== h) {
        noise.width = w
        noise.height = h
      }
      const noiseData = noiseCtx.createImageData(w, h)
      // Visible B/W luminance noise (never flat gray).
      fillNoiseImageData(noiseData, 0.5)
      noiseCtx.putImageData(noiseData, 0, 0)
      noiseReadyRef.current = true
    }

    staircaseRef.current = randomizeOrientation(staircaseRef.current)
    const patchPx = patchSizeRef.current
    const patchData = renderGaborImageData(
      patchPx,
      staircaseRef.current.stimulus,
    )
    const patch = patchCanvasRef.current!
    const patchCtx = patch.getContext('2d')!
    patchCtx.putImageData(patchData, 0, 0)

    placementRef.current = pickPatchPlacement(
      w,
      h,
      patchPx,
      placementRef.current,
    )
    trialStartedAtRef.current = performance.now()
    awaitingRef.current = true
    trialCountRef.current += 1
    syncHud('慢慢找条纹小斑点～', GABOR_LIMITS.responseMs)
  }, [ensureOffscreens, syncHud])

  const resolveTrial = useCallback(
    (
      outcome: 'hit' | 'miss',
      reactionMs: number | null,
      atX?: number,
      atY?: number,
    ) => {
      if (!awaitingRef.current) return
      awaitingRef.current = false

      const stimulus = staircaseRef.current.stimulus
      const { next, adjusted } = updateStaircase(staircaseRef.current, outcome)
      staircaseRef.current = next
      if (adjusted !== 'none') reversalsRef.current += 1

      setSamples((prev) => [
        ...prev,
        {
          trial: prev.length + 1,
          contrast: stimulus.contrast,
          spatialFrequency: stimulus.spatialFrequency,
          outcome,
          reactionMs,
        },
      ])

      recordTrial(outcome, reactionMs, outcome === 'hit' ? 1 : 0)
      setClinical({
        finalContrast: next.stimulus.contrast,
        finalSpatialFrequency: next.stimulus.spatialFrequency,
        reversalCount: reversalsRef.current,
        trialCount: trialCountRef.current,
      })

      if (outcome === 'hit') {
        playTone('success')
        if (atX != null && atY != null) {
          particlesRef.current.push(...spawnConfetti(atX, atY))
          particlesRef.current.push(
            ...Array.from({ length: 10 }, (_, i) => {
              const a = (i / 10) * Math.PI * 2
              return {
                x: atX,
                y: atY,
                vx: Math.cos(a) * 3.2,
                vy: Math.sin(a) * 3.2,
                life: 0.45,
                color: 'rgba(255,255,255,0.85)',
                size: 5,
              }
            }),
          )
        }
        setScore((s) => {
          const streak = s.streak + 1
          return {
            hits: s.hits + 1,
            misses: s.misses,
            streak,
          }
        })
        syncHud(
          adjusted !== 'none'
            ? '更难一点点啦，眼睛真棒！'
            : '太棒了！✨',
        )
      } else {
        playTone('error')
        setScore((s) => ({
          hits: s.hits,
          misses: s.misses + 1,
          streak: 0,
        }))
        syncHud('时间到了，斑点会再出现一次～')
      }

      window.setTimeout(() => {
        if (runningRef.current) prepareTrial()
      }, GABOR_LIMITS.interTrialMs)
    },
    [prepareTrial, recordTrial, setClinical, syncHud],
  )

  /** Fit canvas buffer only — never restart the trial (that caused endless flashing). */
  const fitStage = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const size = fitCanvasToParent(canvas, ctx)
    const prev = viewSizeRef.current
    viewSizeRef.current = size
    // First layout while running with no placement yet → start one trial.
    if (
      runningRef.current &&
      !placementRef.current &&
      size.w > 0 &&
      size.h > 0
    ) {
      prepareTrial()
      return
    }
    // Significant size change mid-trial: keep searching, just clamp placement.
    if (
      placementRef.current &&
      (Math.abs(prev.w - size.w) > 2 || Math.abs(prev.h - size.h) > 2)
    ) {
      const p = placementRef.current
      p.pixelX = Math.min(Math.max(0, p.pixelX), Math.max(0, size.w - p.size))
      p.pixelY = Math.min(Math.max(0, p.pixelY), Math.max(0, size.h - p.size))
    }
  }, [prepareTrial])

  useEffect(() => {
    if (locked && running) {
      setRunning(false)
      awaitingRef.current = false
      void end({ save: true })
      syncHud('今日训练时间到，先休息眼睛吧～')
    }
  }, [locked, running, end, syncHud])

  useEffect(() => {
    if (!running) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    fitStage()
    window.addEventListener('resize', fitStage)
    document.addEventListener('fullscreenchange', fitStage)

    let lastRemainingBucket = -1

    const loop = () => {
      const { w: cssW, h: cssH } = viewSizeRef.current
      ctx.clearRect(0, 0, cssW, cssH)

      if (noiseCanvasRef.current && noiseReadyRef.current) {
        ctx.drawImage(noiseCanvasRef.current, 0, 0, cssW, cssH)
      } else {
        // Ensure offscreen noise exists even before first trial settles.
        ensureOffscreens(cssW, cssH)
        const noise = noiseCanvasRef.current
        if (noise && cssW > 0 && cssH > 0) {
          const nctx = noise.getContext('2d')
          if (nctx) {
            const noiseData = nctx.createImageData(cssW, cssH)
            fillNoiseImageData(noiseData, 0.5)
            nctx.putImageData(noiseData, 0, 0)
            noiseReadyRef.current = true
            ctx.drawImage(noise, 0, 0, cssW, cssH)
          }
        }
      }

      const placement = placementRef.current
      if (placement && patchCanvasRef.current && awaitingRef.current) {
        ctx.drawImage(
          patchCanvasRef.current,
          placement.pixelX,
          placement.pixelY,
          placement.size,
          placement.size,
        )
        // Soft halo so kids notice the patch without spoiling the task.
        const elapsed = performance.now() - trialStartedAtRef.current
        if (elapsed > 4000) {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'
          ctx.lineWidth = 2
          ctx.strokeRect(
            placement.pixelX - 6,
            placement.pixelY - 6,
            placement.size + 12,
            placement.size + 12,
          )
        }
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      for (let i = 1; i < GRID; i += 1) {
        const x = (cssW / GRID) * i
        const y = (cssH / GRID) * i
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, cssH)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(cssW, y)
        ctx.stroke()
      }

      if (awaitingRef.current) {
        const remaining = Math.max(
          0,
          GABOR_LIMITS.responseMs -
            (performance.now() - trialStartedAtRef.current),
        )
        // Update HUD at most ~2Hz — avoids re-render storms.
        const bucket = Math.floor(remaining / 500)
        if (bucket !== lastRemainingBucket) {
          lastRemainingBucket = bucket
          syncHud(undefined, remaining)
        }
        if (remaining <= 0) {
          resolveTrial('miss', null)
        }
      }

      particlesRef.current = particlesRef.current
        .map((p) => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.12,
          life: p.life - 0.016,
        }))
        .filter((p) => p.life > 0)

      for (const p of particlesRef.current) {
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('resize', fitStage)
      document.removeEventListener('fullscreenchange', fitStage)
      cancelAnimationFrame(rafRef.current)
      awaitingRef.current = false
      placementRef.current = null
    }
  }, [running, fitStage, resolveTrial, syncHud])

  const handlePointer = (clientX: number, clientY: number) => {
    if (!running || !awaitingRef.current) return
    const canvas = canvasRef.current
    const placement = placementRef.current
    if (!canvas || !placement) return

    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const pad = GABOR_LIMITS.hitPaddingPx
    const hit =
      x >= placement.pixelX - pad &&
      x <= placement.pixelX + placement.size + pad &&
      y >= placement.pixelY - pad &&
      y <= placement.pixelY + placement.size + pad

    if (hit) {
      const reactionMs = performance.now() - trialStartedAtRef.current
      resolveTrial('hit', reactionMs, x, y)
      return
    }

    // Wrong tap: keep the same patch — do not flash a new trial.
    playTone('error')
    syncHud('还没点到哦，再找找条纹斑～')
  }

  return (
    <GameShell title="Gabor 找斑点" subtitle="视敏度">
      <GaborBody
        canvasRef={canvasRef}
        running={running}
        score={score}
        hud={hud}
        onPointer={handlePointer}
        onStageResize={fitStage}
        onStart={() => {
          if (!begin()) {
            syncHud('今日训练时间已用完，请先休息眼睛～')
            return
          }
          const ability = getGameAbility('gabor')
          const startC = gaborStartContrastForLevel(1.0, ability.level)
          patchSizeRef.current = gaborPatchSizeForLevel(ability.level)
          staircaseRef.current = createInitialStaircase(startC)
          setSamples([])
          setScore({ hits: 0, misses: 0, streak: 0 })
          trialCountRef.current = 0
          reversalsRef.current = 0
          noiseReadyRef.current = false
          placementRef.current = null
          setClinical({
            finalContrast: startC,
            finalSpatialFrequency: staircaseRef.current.stimulus.spatialFrequency,
            reversalCount: 0,
            trialCount: 0,
          })
          setRunning(true)
          syncHud('先找找有条纹的小斑点～点到它！')
          playTone('tick')
        }}
        onEnd={() => {
          setRunning(false)
          awaitingRef.current = false
          placementRef.current = null
          const s = staircaseRef.current.stimulus
          setClinical({
            finalContrast: s.contrast,
            finalSpatialFrequency: s.spatialFrequency,
            reversalCount: reversalsRef.current,
            trialCount: trialCountRef.current,
          })
          void end({ save: true })
          const c = Math.round(s.contrast * 100)
          syncHud(
            c < 45
              ? `今天找得很细心！最难时对比度约 ${c}%～`
              : `练完啦！今天最难对比度约 ${c}%，明天还能更棒`,
          )
        }}
      />
    </GameShell>
  )
}

function GaborBody({
  canvasRef,
  running,
  score,
  hud,
  onPointer,
  onStageResize,
  onStart,
  onEnd,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  running: boolean
  score: { hits: number; misses: number; streak: number }
  hud: HudState
  onPointer: (x: number, y: number) => void
  onStageResize: () => void
  onStart: () => void
  onEnd: () => void
}) {
  const { isFullscreen } = useGameShell()
  return (
    <div
      className={
        isFullscreen
          ? 'flex min-h-0 flex-1 flex-col'
          : 'mx-auto flex w-full max-w-4xl flex-col px-4 py-6 sm:px-6'
      }
    >
      {!isFullscreen && (
        <header className="mb-4 text-left">
          <h1 className="text-3xl font-black tracking-tight text-slate-800">
            找出条纹斑点
          </h1>
        </header>
      )}

      <GameHud>
        <GameHudStat label="得分" value={`${score.hits}`} />
        <GameHudStat
          label="倒计时"
          value={`${Math.ceil(hud.remainingMs / 1000)}s`}
        />
        {isFullscreen && (
          <p className="ml-auto self-center text-base font-bold text-white/80">
            {hud.message}
          </p>
        )}
      </GameHud>

      <CanvasStage className="bg-slate-700" onResize={onStageResize}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={(e) => {
            e.preventDefault()
            onPointer(e.clientX, e.clientY)
          }}
        />
      </CanvasStage>

      {!isFullscreen && (
        <p className="mt-4 mb-4 text-center text-lg font-extrabold text-slate-700">
          {hud.message}
        </p>
      )}

      <GameControls>
        {!running ? (
          <button
            type="button"
            className="min-h-14 min-w-12 rounded-2xl bg-sky-500 px-8 py-3 text-lg font-extrabold text-white shadow-md shadow-sky-200"
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
                : 'min-h-14 min-w-12 rounded-2xl bg-white px-6 py-3 text-lg font-extrabold text-slate-700 ring-1 ring-slate-200'
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
