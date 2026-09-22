import { useCallback, useEffect, useRef, useState } from 'react'
import { useTrainingSession } from '../hooks/useTrainingSession'
import { playTone } from '../lib/audio'
import { toBlueCss, toRedCss } from '../lib/colorConfig'
import {
  clampPlayerY,
  rectsOverlap,
  swipeToVerticalIntent,
  type Rect,
} from '../lib/dichoptic'
import { fitCanvasToParent } from '../lib/fitCanvas'
import { fillDichopticPlaid } from '../lib/grating'
import { useColorConfigStore } from '../store/colorConfigStore'
import { CanvasStage } from './CanvasStage'
import {
  GameControls,
  GameHud,
  GameHudStat,
  GameShell,
  useGameShell,
} from './GameShell'

interface Coin {
  id: number
  x: number
  y: number
  r: number
  collected: boolean
}

interface Obstacle {
  id: number
  x: number
  y: number
  w: number
  h: number
}

interface TrackMark {
  x: number
  y: number
  w: number
}

interface GameSnapshot {
  score: number
  lives: number
  distance: number
  message: string
}

const FRAME = 28
const PLAYER_W = 44
const PLAYER_H = 36
const SCROLL_SPEED = 110
const PLAYER_SPEED = 220
const SPAWN_COIN_MS = 1400
const SPAWN_OBS_MS = 2200

function drawFusionFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const cell = 14
  for (let x = 0; x < w; x += cell) {
    for (let y = 0; y < FRAME; y += cell) {
      ctx.fillStyle = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? '#fff' : '#111'
      ctx.fillRect(x, y, cell, cell)
      ctx.fillRect(x, h - FRAME + y, cell, cell)
    }
  }
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < FRAME; x += cell) {
      ctx.fillStyle = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? '#fff' : '#111'
      ctx.fillRect(x, y, cell, cell)
      ctx.fillRect(w - FRAME + x, y, cell, cell)
    }
  }

  // Central fusion crosshair (both eyes)
  const cx = w / 2
  const cy = h / 2
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx - 18, cy)
  ctx.lineTo(cx + 18, cy)
  ctx.moveTo(cx, cy - 18)
  ctx.lineTo(cx, cy + 18)
  ctx.stroke()
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1.5
  ctx.strokeRect(cx - 10, cy - 10, 20, 20)
}

function drawBear(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void {
  ctx.fillStyle = color
  // body
  ctx.beginPath()
  ctx.roundRect(x, y + 8, PLAYER_W, PLAYER_H - 8, 10)
  ctx.fill()
  // head
  ctx.beginPath()
  ctx.arc(x + PLAYER_W / 2, y + 10, 14, 0, Math.PI * 2)
  ctx.fill()
  // ears
  ctx.beginPath()
  ctx.arc(x + 10, y + 2, 6, 0, Math.PI * 2)
  ctx.arc(x + PLAYER_W - 10, y + 2, 6, 0, Math.PI * 2)
  ctx.fill()
  // eyes (dark so visible on blue)
  ctx.fillStyle = '#001018'
  ctx.beginPath()
  ctx.arc(x + PLAYER_W / 2 - 5, y + 8, 2.2, 0, Math.PI * 2)
  ctx.arc(x + PLAYER_W / 2 + 5, y + 8, 2.2, 0, Math.PI * 2)
  ctx.fill()
}

function drawCoin(
  ctx: CanvasRenderingContext2D,
  coin: Coin,
  color: string,
): void {
  if (coin.collected) return
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(coin.x, coin.y, coin.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.font = 'bold 12px Nunito, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('★', coin.x, coin.y + 1)
}

function drawObstacle(
  ctx: CanvasRenderingContext2D,
  obs: Obstacle,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 8)
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.fillRect(obs.x + 6, obs.y + 6, obs.w - 12, 4)
}

export function DichopticGame() {
  const { begin, end, recordTrial, setScore: setSessionScore, setClinical, locked } =
    useTrainingSession('dichoptic')
  const redR = useColorConfigStore((s) => s.redR)
  const blueG = useColorConfigStore((s) => s.blueG)
  const blueB = useColorConfigStore((s) => s.blueB)
  const redCss = toRedCss(redR)
  const blueCss = toBlueCss(blueG, blueB)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runningRef = useRef(false)
  const rafRef = useRef(0)
  const keysRef = useRef({ up: false, down: false })
  const swipeIntentRef = useRef<-1 | 0 | 1>(0)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const viewRef = useRef({ w: 640, h: 420 })
  const playerRef = useRef({ x: 80, y: 180 })
  const coinsRef = useRef<Coin[]>([])
  const obstaclesRef = useRef<Obstacle[]>([])
  const tracksRef = useRef<TrackMark[]>([])
  const idRef = useRef(1)
  const lastTsRef = useRef(0)
  const spawnCoinAtRef = useRef(0)
  const spawnObsAtRef = useRef(0)
  const invulnUntilRef = useRef(0)
  const statsRef = useRef({ score: 0, lives: 3, distance: 0 })
  const dichopticCountsRef = useRef({ redHits: 0, blueCollisions: 0 })
  const hudSyncAtRef = useRef(0)

  const [running, setRunning] = useState(false)
  const [snap, setSnap] = useState<GameSnapshot>({
    score: 0,
    lives: 3,
    distance: 0,
    message: '戴上红蓝眼镜：红=赛道/金币，蓝=小熊/障碍',
  })

  runningRef.current = running

  const resetWorld = useCallback(() => {
    const { h } = viewRef.current
    playerRef.current = { x: 80, y: h / 2 - PLAYER_H / 2 }
    coinsRef.current = []
    obstaclesRef.current = []
    tracksRef.current = []
    for (let i = 0; i < 12; i += 1) {
      tracksRef.current.push({
        x: i * 70,
        y: h / 2 - 2,
        w: 40,
      })
    }
    idRef.current = 1
    spawnCoinAtRef.current = 0
    spawnObsAtRef.current = 400
    invulnUntilRef.current = 0
    lastTsRef.current = 0
    statsRef.current = { score: 0, lives: 3, distance: 0 }
    dichopticCountsRef.current = { redHits: 0, blueCollisions: 0 }
    setSnap({
      score: 0,
      lives: 3,
      distance: 0,
      message: '方向键或上下滑动控制小熊，收集红星，避开蓝障碍！',
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault()
        keysRef.current.up = true
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault()
        keysRef.current.down = true
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        keysRef.current.up = false
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        keysRef.current.down = false
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  useEffect(() => {
    if (!running) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const { w, h } = fitCanvasToParent(canvas, ctx)
      viewRef.current = { w, h }
      playerRef.current.y = clampPlayerY(
        playerRef.current.y,
        PLAYER_H,
        FRAME + 8,
        h - FRAME - 8,
      )
    }

    resize()
    window.addEventListener('resize', resize)
    document.addEventListener('fullscreenchange', resize)

    const loop = (ts: number) => {
      if (!runningRef.current) return
      if (!lastTsRef.current) lastTsRef.current = ts
      const dt = Math.min(0.033, (ts - lastTsRef.current) / 1000)
      lastTsRef.current = ts

      const { w, h } = viewRef.current
      const fieldTop = FRAME + 8
      const fieldBottom = h - FRAME - 8
      const scroll = SCROLL_SPEED * dt

      // Player movement
      let vy = 0
      if (keysRef.current.up) vy -= 1
      if (keysRef.current.down) vy += 1
      if (swipeIntentRef.current !== 0) {
        vy = swipeIntentRef.current
      }
      playerRef.current.y = clampPlayerY(
        playerRef.current.y + vy * PLAYER_SPEED * dt,
        PLAYER_H,
        fieldTop,
        fieldBottom,
      )

      // Scroll track marks (red channel scenery)
      for (const mark of tracksRef.current) {
        mark.x -= scroll
      }
      tracksRef.current = tracksRef.current.filter((m) => m.x + m.w > 0)
      while (tracksRef.current.length < 14) {
        const last = tracksRef.current[tracksRef.current.length - 1]
        tracksRef.current.push({
          x: (last?.x ?? 0) + 70,
          y: h / 2 - 2,
          w: 40,
        })
      }

      // Spawns
      spawnCoinAtRef.current -= dt * 1000
      spawnObsAtRef.current -= dt * 1000
      if (spawnCoinAtRef.current <= 0) {
        coinsRef.current.push({
          id: idRef.current++,
          x: w + 20,
          y: fieldTop + 20 + Math.random() * (fieldBottom - fieldTop - 40),
          r: 14,
          collected: false,
        })
        spawnCoinAtRef.current = SPAWN_COIN_MS * (0.7 + Math.random() * 0.6)
      }
      if (spawnObsAtRef.current <= 0) {
        const oh = 28 + Math.random() * 40
        obstaclesRef.current.push({
          id: idRef.current++,
          x: w + 30,
          y: fieldTop + Math.random() * Math.max(10, fieldBottom - fieldTop - oh),
          w: 36 + Math.random() * 24,
          h: oh,
        })
        spawnObsAtRef.current = SPAWN_OBS_MS * (0.75 + Math.random() * 0.5)
      }

      for (const c of coinsRef.current) c.x -= scroll
      for (const o of obstaclesRef.current) o.x -= scroll
      coinsRef.current = coinsRef.current.filter((c) => !c.collected && c.x > -40)
      obstaclesRef.current = obstaclesRef.current.filter((o) => o.x > -80)

      const playerRect: Rect = {
        x: playerRef.current.x,
        y: playerRef.current.y,
        w: PLAYER_W,
        h: PLAYER_H,
      }

      let scoreGain = 0
      for (const c of coinsRef.current) {
        if (c.collected) continue
        const coinRect: Rect = {
          x: c.x - c.r,
          y: c.y - c.r,
          w: c.r * 2,
          h: c.r * 2,
        }
        if (rectsOverlap(playerRect, coinRect)) {
          c.collected = true
          scoreGain += 1
          playTone('success')
        }
      }

      let hit = false
      if (ts >= invulnUntilRef.current) {
        for (const o of obstaclesRef.current) {
          if (rectsOverlap(playerRect, o)) {
            hit = true
            break
          }
        }
      }

      statsRef.current.distance += scroll * 0.05
      let hudMessage: string | undefined

      if (scoreGain > 0) {
        statsRef.current.score += scoreGain
        dichopticCountsRef.current.redHits += scoreGain
        setSessionScore(statsRef.current.score)
        recordTrial('hit', null, scoreGain)
        setClinical({
          redHits: dichopticCountsRef.current.redHits,
          blueCollisions: dichopticCountsRef.current.blueCollisions,
        })
        hudMessage = '收集到红星！双眼合作真棒！'
      }

      if (hit) {
        statsRef.current.lives = Math.max(0, statsRef.current.lives - 1)
        dichopticCountsRef.current.blueCollisions += 1
        invulnUntilRef.current = ts + 1200
        playTone('error')
        recordTrial('miss', null, 0)
        setClinical({
          redHits: dichopticCountsRef.current.redHits,
          blueCollisions: dichopticCountsRef.current.blueCollisions,
        })
        if (statsRef.current.lives === 0) {
          hudMessage = '训练结束啦，再来一局吧！'
          runningRef.current = false
          queueMicrotask(() => {
            setRunning(false)
            void end({ save: true })
          })
        } else {
          hudMessage = '另一只眼睛也要一起看～小心蓝障碍'
        }
        setSnap({
          score: statsRef.current.score,
          lives: statsRef.current.lives,
          distance: statsRef.current.distance,
          message: hudMessage,
        })
      } else if (scoreGain > 0) {
        setSnap({
          score: statsRef.current.score,
          lives: statsRef.current.lives,
          distance: statsRef.current.distance,
          message: hudMessage!,
        })
      } else if (ts - hudSyncAtRef.current > 200) {
        hudSyncAtRef.current = ts
        setSnap((prev) => ({
          ...prev,
          distance: statsRef.current.distance,
        }))
      }

      // --- Draw ---
      // Slow-drifting red/blue plaid grating (clinical-style binocular stimulation).
      const gratingPhase = (ts * 0.018) % 200
      fillDichopticPlaid(ctx, w, h, redCss, blueCss, 30, gratingPhase)

      // Soft dark veil so sprites stay readable
      ctx.fillStyle = 'rgba(5,7,12,0.28)'
      ctx.fillRect(FRAME, FRAME, w - FRAME * 2, h - FRAME * 2)

      // Red channel: subtle lane rails + track dashes + coins
      ctx.strokeStyle = redCss
      ctx.globalAlpha = 0.7
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(FRAME, fieldTop + 24)
      ctx.lineTo(w - FRAME, fieldTop + 24)
      ctx.moveTo(FRAME, fieldBottom - 24)
      ctx.lineTo(w - FRAME, fieldBottom - 24)
      ctx.stroke()
      ctx.globalAlpha = 1

      ctx.fillStyle = redCss
      for (const mark of tracksRef.current) {
        ctx.globalAlpha = 0.85
        ctx.fillRect(mark.x, mark.y, mark.w, 4)
      }
      ctx.globalAlpha = 1

      for (const c of coinsRef.current) {
        drawCoin(ctx, c, redCss)
      }

      // Blue channel: obstacles + player
      for (const o of obstaclesRef.current) {
        drawObstacle(ctx, o, blueCss)
      }

      const blink =
        ts < invulnUntilRef.current ? Math.floor(ts / 100) % 2 === 0 : true
      if (blink) {
        drawBear(ctx, playerRef.current.x, playerRef.current.y, blueCss)
      }

      drawFusionFrame(ctx, w, h)

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('resize', resize)
      document.removeEventListener('fullscreenchange', resize)
      cancelAnimationFrame(rafRef.current)
    }
  }, [running, redCss, blueCss, recordTrial, setSessionScore, setClinical, end])

  useEffect(() => {
    if (locked && running) {
      setRunning(false)
      void end({ save: true })
      setSnap((s) => ({
        ...s,
        message: '今日训练时间到，先休息眼睛吧～',
      }))
    }
  }, [locked, running, end])

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
    swipeIntentRef.current = 0
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStartRef.current.x
    const dy = t.clientY - touchStartRef.current.y
    swipeIntentRef.current = swipeToVerticalIntent(dx, dy)
  }

  const onTouchEnd = () => {
    touchStartRef.current = null
    swipeIntentRef.current = 0
  }

  return (
    <GameShell title="红蓝小熊冒险" subtitle="抗抑制 · 需红蓝眼镜">
      <DichopticBody
        canvasRef={canvasRef}
        running={running}
        snap={snap}
        redCss={redCss}
        blueCss={blueCss}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onStageResize={() => {
          const canvas = canvasRef.current
          const ctx = canvas?.getContext('2d')
          if (!canvas || !ctx) return
          const { w, h } = fitCanvasToParent(canvas, ctx)
          viewRef.current = { w, h }
        }}
        keysRef={keysRef}
        onStart={() => {
          if (!begin()) {
            setSnap((s) => ({
              ...s,
              message: '今日训练时间已用完，请先休息眼睛～',
            }))
            return
          }
          resetWorld()
          setRunning(true)
          playTone('tick')
        }}
        onEnd={() => {
          setRunning(false)
          void end({ save: true })
          setSnap((s) => ({ ...s, message: '已结束并保存记录' }))
        }}
      />
    </GameShell>
  )
}

function DichopticBody({
  canvasRef,
  running,
  snap,
  redCss,
  blueCss,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onStageResize,
  keysRef,
  onStart,
  onEnd,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  running: boolean
  snap: GameSnapshot
  redCss: string
  blueCss: string
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: () => void
  onStageResize: () => void
  keysRef: React.MutableRefObject<{ up: boolean; down: boolean }>
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
        <>
          <header className="mb-5 text-left">
            <p className="inline-flex rounded-full bg-rose-200/80 px-3 py-1 text-sm font-bold text-rose-900">
              模块三 · 红蓝抗抑制
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-800 sm:text-4xl">
              小熊双眼大冒险
            </h1>
            <p className="mt-2 max-w-2xl text-base text-slate-600">
              戴上红蓝眼镜：红镜看赛道与金币，蓝镜看小熊与障碍。四周黑白格与中央十字双眼都能看见，帮助融像对焦。
            </p>
          </header>
          <div className="mb-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full px-3 py-1 text-white" style={{ background: redCss }}>
              红通道 · 赛道/金币
            </span>
            <span className="rounded-full px-3 py-1 text-white" style={{ background: blueCss }}>
              蓝通道 · 角色/障碍
            </span>
          </div>
        </>
      )}

      <GameHud>
        <GameHudStat label="红星得分" value={`${snap.score}`} />
        <GameHudStat label="生命" value={`${snap.lives}`} />
        <GameHudStat label="路程" value={`${Math.floor(snap.distance)}m`} />
        {isFullscreen && (
          <p className="ml-auto self-center text-xs font-bold text-white/70">
            {snap.message}
          </p>
        )}
      </GameHud>

      <CanvasStage
        className="bg-black"
        onResize={onStageResize}
      >
        <div
          className="absolute inset-0"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
        </div>
      </CanvasStage>

      {!isFullscreen && (
        <p className="mt-4 mb-4 text-center text-base font-extrabold text-slate-700">
          {snap.message}
        </p>
      )}

      <GameControls>
        {!running ? (
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-rose-500 px-6 py-3 font-extrabold text-white"
            onClick={onStart}
          >
            开始冒险
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
        <button
          type="button"
          aria-label="向上"
          className="min-h-12 min-w-12 rounded-2xl bg-sky-500 text-xl font-black text-white"
          onPointerDown={() => {
            keysRef.current.up = true
          }}
          onPointerUp={() => {
            keysRef.current.up = false
          }}
          onPointerLeave={() => {
            keysRef.current.up = false
          }}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="向下"
          className="min-h-12 min-w-12 rounded-2xl bg-sky-500 text-xl font-black text-white"
          onPointerDown={() => {
            keysRef.current.down = true
          }}
          onPointerUp={() => {
            keysRef.current.down = false
          }}
          onPointerLeave={() => {
            keysRef.current.down = false
          }}
        >
          ↓
        </button>
      </GameControls>
    </div>
  )
}
