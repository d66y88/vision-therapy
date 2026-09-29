import { useCallback, useEffect, useRef, useState } from 'react'
import { useTrainingSession } from '../../hooks/useTrainingSession'
import {
  beadGoalForLevel,
  beadHoleForLevel,
  beadPileExtraForLevel,
  beadToleranceForLevel,
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

/** Cute bead charms — circles + cartoon silhouettes (animals / shapes). */
type BeadKind =
  | 'plain'
  | 'bear'
  | 'cat'
  | 'star'
  | 'heart'
  | 'duck'
  | 'fish'
  | 'flower'
  | 'rainbow'
  | 'frog'

interface BeadStyle {
  kind: BeadKind
  color: string
  accent: string
  gloss: string
}

const BEAD_STYLES: BeadStyle[] = [
  { kind: 'bear', color: '#e8a45a', accent: '#8b5a2b', gloss: '#ffe4c4' },
  { kind: 'bear', color: '#d4a574', accent: '#7c4a1e', gloss: '#fff1e0' },
  { kind: 'cat', color: '#f4a261', accent: '#b5651d', gloss: '#ffedd5' },
  { kind: 'cat', color: '#e2e8f0', accent: '#64748b', gloss: '#f8fafc' },
  { kind: 'star', color: '#f5c542', accent: '#d97706', gloss: '#fef3c7' },
  { kind: 'star', color: '#fde68a', accent: '#ca8a04', gloss: '#fffbeb' },
  { kind: 'heart', color: '#fb7185', accent: '#e11d48', gloss: '#ffe4e6' },
  { kind: 'heart', color: '#f9a8d4', accent: '#db2777', gloss: '#fce7f3' },
  { kind: 'duck', color: '#fde047', accent: '#ca8a04', gloss: '#fefce8' },
  { kind: 'fish', color: '#38bdf8', accent: '#0284c7', gloss: '#e0f2fe' },
  { kind: 'fish', color: '#67e8f9', accent: '#0891b2', gloss: '#ecfeff' },
  { kind: 'flower', color: '#f472b6', accent: '#db2777', gloss: '#fce7f3' },
  { kind: 'flower', color: '#c4b5fd', accent: '#7c3aed', gloss: '#ede9fe' },
  { kind: 'rainbow', color: '#a78bfa', accent: '#7c3aed', gloss: '#ede9fe' },
  { kind: 'frog', color: '#86efac', accent: '#16a34a', gloss: '#dcfce7' },
  { kind: 'plain', color: '#2dd4bf', accent: '#0f766e', gloss: '#ccfbf1' },
  { kind: 'plain', color: '#93c5fd', accent: '#2563eb', gloss: '#dbeafe' },
  { kind: 'plain', color: '#fdba74', accent: '#ea580c', gloss: '#ffedd5' },
]

interface Bead {
  id: number
  homeX: number
  homeY: number
  x: number
  y: number
  r: number
  hole: number
  style: BeadStyle
  threaded: boolean
  /** 0 = first on string = innermost (near spool). */
  stringIndex: number
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  born: number
  color: string
  r: number
}

type AlignState = 'idle' | 'near' | 'good' | 'perfect'

/**
 * Near-distance fine alignment: pick beads from a pile, thread onto a wire tip.
 * Tip is always drawn above the dragged bead so the hole never hides alignment.
 */
export function BeadStringGame() {
  const { begin, end, recordTrial, setClinical, locked } =
    useTrainingSession('beadString')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef({ w: 640, h: 420 })
  const beadsRef = useRef<Bead[]>([])
  const sparksRef = useRef<Spark[]>([])
  const dragIdRef = useRef<number | null>(null)
  const tipRef = useRef({ x: 0, y: 0 })
  const holeRef = useRef(10)
  const tolRef = useRef(1.15)
  const goalRef = useRef(12)
  const pileExtraRef = useRef(8)
  const threadedCountRef = useRef(0)
  const braceletsRef = useRef(0)
  const idRef = useRef(1)
  const rafRef = useRef(0)
  const runningRef = useRef(false)
  const braceletStylesRef = useRef<BeadStyle[]>([])
  const alignRef = useRef<AlignState>('idle')

  const [running, setRunning] = useState(false)
  const [score, setScore] = useState({ hits: 0, misses: 0 })
  const [threaded, setThreaded] = useState(0)
  const [goal, setGoal] = useState(12)
  const [bracelets, setBracelets] = useState(0)
  const [message, setMessage] = useState(
    '从下面挑珠子，套到右边线头上，往左串成一串～',
  )
  const [wristShow, setWristShow] = useState<{
    open: boolean
    styles: BeadStyle[]
    count: number
  }>({ open: false, styles: [], count: 0 })
  const wristOpenRef = useRef(false)
  wristOpenRef.current = wristShow.open
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
    tipRef.current = {
      x: sizeRef.current.w * 0.76,
      y: sizeRef.current.h * 0.32,
    }
  }, [])

  const layoutPile = useCallback((hole: number) => {
    const { w, h } = sizeRef.current
    const total = goalRef.current + pileExtraRef.current
    const beads: Bead[] = []
    const trayTop = h * 0.56
    const trayH = h * 0.4
    for (let i = 0; i < total; i += 1) {
      const style = BEAD_STYLES[Math.floor(Math.random() * BEAD_STYLES.length)]!
      const r = hole + 11 + Math.floor(Math.random() * 4)
      const x = 32 + Math.random() * Math.max(40, w - 64)
      const y = trayTop + 20 + Math.random() * Math.max(36, trayH - 44)
      beads.push({
        id: idRef.current++,
        homeX: x,
        homeY: y,
        x,
        y,
        r,
        hole: Math.max(hole, Math.round(r * 0.32)),
        style,
        threaded: false,
        stringIndex: -1,
      })
    }
    beadsRef.current = beads
    braceletStylesRef.current = []
    threadedCountRef.current = 0
    setThreaded(0)
    alignRef.current = 'idle'
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
      const tip = tipRef.current
      const spoolX = w * 0.11
      const spoolY = h * 0.32

      // Warm wood table
      const bg = ctx.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, '#fffbeb')
      bg.addColorStop(0.45, '#fde68a')
      bg.addColorStop(1, '#fbbf24')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
      // Soft light wash
      const wash = ctx.createRadialGradient(
        w * 0.55,
        h * 0.2,
        20,
        w * 0.55,
        h * 0.35,
        w * 0.55,
      )
      wash.addColorStop(0, 'rgba(255,255,255,0.35)')
      wash.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = wash
      ctx.fillRect(0, 0, w, h)

      // Felt tray
      roundRect(ctx, 14, h * 0.54, w - 28, h * 0.43, 22)
      const felt = ctx.createLinearGradient(0, h * 0.54, 0, h)
      felt.addColorStop(0, '#b45309')
      felt.addColorStop(1, '#78350f')
      ctx.fillStyle = felt
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      roundRect(ctx, 22, h * 0.56, w - 44, h * 0.08, 14)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,237,213,0.9)'
      ctx.font = `700 ${Math.max(13, Math.round(w * 0.03))}px ui-rounded, system-ui`
      ctx.fillText('珠子堆 · 拖到右边线头上，套进去往左串', 32, h * 0.54 + 28)

      // Cord: spool (left) → tip (right). Beads slide left onto the string.
      ctx.strokeStyle = 'rgba(120,53,15,0.22)'
      ctx.lineWidth = 7
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(spoolX, spoolY + 2)
      ctx.quadraticCurveTo(w * 0.42, spoolY - 8, tip.x, tip.y + 2)
      ctx.stroke()
      const cord = ctx.createLinearGradient(spoolX, 0, tip.x, 0)
      cord.addColorStop(0, '#92400e')
      cord.addColorStop(0.35, '#eab308')
      cord.addColorStop(0.7, '#fde047')
      cord.addColorStop(1, '#facc15')
      ctx.strokeStyle = cord
      ctx.lineWidth = 4.2
      ctx.beginPath()
      ctx.moveTo(spoolX, spoolY)
      ctx.quadraticCurveTo(w * 0.42, spoolY - 10, tip.x, tip.y)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(254,249,195,0.7)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(spoolX, spoolY - 1.4)
      ctx.quadraticCurveTo(w * 0.42, spoolY - 11.4, tip.x, tip.y - 1.3)
      ctx.stroke()

      // Spool
      drawSpool(ctx, spoolX, spoolY)

      const dragId = dragIdRef.current
      const dragBead = dragId
        ? beadsRef.current.find((b) => b.id === dragId)
        : null

      // Align bead center with tip (tip is on the right; beads slide left onto the cord)
      if (dragBead && !dragBead.threaded) {
        const dist = Math.hypot(dragBead.x - tip.x, dragBead.y - tip.y)
        const perfect = dragBead.hole * 0.55
        const good = dragBead.hole * tolRef.current + 2
        const near = dragBead.r + 34 * tolRef.current
        alignRef.current =
          dist <= perfect ? 'perfect' : dist <= good ? 'good' : dist <= near ? 'near' : 'idle'
      } else {
        alignRef.current = 'idle'
      }

      // Threaded beads: 0 innermost near spool (left), newest closer to tip
      const onString = beadsRef.current
        .filter((b) => b.threaded)
        .sort((a, b) => a.stringIndex - b.stringIndex)
      const n = onString.length
      onString.forEach((b, i) => {
        const t = n <= 1 ? 0.26 : 0.2 + (i / Math.max(1, n - 1)) * 0.68
        b.x = spoolX + (tip.x - spoolX) * t
        b.y = spoolY + (tip.y - spoolY) * t - Math.sin(i * 0.85) * 2
        drawBead(ctx, b, false, true)
      })

      // Pile beads
      for (const b of beadsRef.current) {
        if (b.threaded || b.id === dragId) continue
        drawBead(ctx, b, false, false)
      }

      // Dragged bead; tip drawn on top so you can see when it's threaded through
      if (dragBead && !dragBead.threaded) {
        drawBead(ctx, dragBead, true, false)
        if (alignRef.current !== 'idle') {
          // Soft aim ring at bead center (not a painted hole on the bead art)
          ctx.beginPath()
          ctx.arc(dragBead.x, dragBead.y, dragBead.hole + 2, 0, Math.PI * 2)
          ctx.strokeStyle =
            alignRef.current === 'perfect'
              ? 'rgba(34,197,94,0.95)'
              : alignRef.current === 'good'
                ? 'rgba(234,179,8,0.9)'
                : 'rgba(255,255,255,0.75)'
          ctx.lineWidth = 2.4
          ctx.stroke()
        }
      }

      // Tip ALWAYS on top — never covered by the bead body
      drawTip(ctx, tip.x, tip.y, alignRef.current, now)

      // Alignment ring around tip when dragging nearby
      if (alignRef.current !== 'idle' && dragBead) {
        drawAlignGuide(ctx, tip.x, tip.y, dragBead, alignRef.current)
      }

      // Sparks
      sparksRef.current = sparksRef.current.filter((s) => now - s.born < 500)
      for (const s of sparksRef.current) {
        const t = (now - s.born) / 500
        ctx.globalAlpha = 1 - t
        ctx.fillStyle = s.color
        ctx.beginPath()
        ctx.arc(
          s.x + s.vx * t * 50,
          s.y + s.vy * t * 50 - t * 10,
          s.r * (1 - t * 0.4),
          0,
          Math.PI * 2,
        )
        ctx.fill()
        ctx.globalAlpha = 1
      }

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, syncSize])

  const startNextBracelet = useCallback(() => {
    layoutPile(holeRef.current)
    setMessage(
      `第 ${braceletsRef.current + 1} 串：套到线头上往左串，再穿 ${goalRef.current} 颗`,
    )
    playTone('tick')
  }, [layoutPile])

  const completeBracelet = useCallback(() => {
    const styles = [...braceletStylesRef.current]
    braceletsRef.current += 1
    setBracelets(braceletsRef.current)
    playTone('cheer')
    setWristShow({
      open: true,
      styles,
      count: braceletsRef.current,
    })
    setMessage(`第 ${braceletsRef.current} 串完成！`)
  }, [])

  const tryThread = (bead: Bead) => {
    const tip = tipRef.current
    const dist = Math.hypot(bead.x - tip.x, bead.y - tip.y)
    const need = bead.hole * tolRef.current + 2
    if (dist > need) return false

    bead.threaded = true
    bead.stringIndex = threadedCountRef.current
    threadedCountRef.current += 1
    braceletStylesRef.current.push(bead.style)
    const n = threadedCountRef.current
    setThreaded(n)
    recordTrial('hit', null, 1)
    setScore((s) => ({ ...s, hits: s.hits + 1 }))
    playTone('pop')
    const now = performance.now()
    for (let i = 0; i < 16; i += 1) {
      const a = (Math.PI * 2 * i) / 16
      sparksRef.current.push({
        x: tip.x,
        y: tip.y,
        vx: Math.cos(a) * (0.8 + Math.random()),
        vy: Math.sin(a) * (0.8 + Math.random()),
        born: now,
        color: i % 2 === 0 ? bead.style.color : '#fef08a',
        r: 2 + Math.random() * 2.5,
      })
    }

    if (n >= goalRef.current) completeBracelet()
    else setMessage(`穿上啦！这串还差 ${goalRef.current - n} 颗`)
    return true
  }

  const onPointerDown = (clientX: number, clientY: number) => {
    if (!running || wristOpenRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const hit = [...beadsRef.current]
      .reverse()
      .find((b) => !b.threaded && Math.hypot(b.x - x, b.y - y) <= b.r + 6)
    if (!hit) return
    dragIdRef.current = hit.id
    hit.x = x
    hit.y = y
  }

  const onPointerMove = (clientX: number, clientY: number) => {
    if (!running || dragIdRef.current == null || wristOpenRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const bead = beadsRef.current.find((b) => b.id === dragIdRef.current)
    if (!bead || bead.threaded) return
    bead.x = clientX - rect.left
    bead.y = clientY - rect.top
  }

  const releaseDrag = () => {
    if (!running || dragIdRef.current == null) return
    const bead = beadsRef.current.find((b) => b.id === dragIdRef.current)
    dragIdRef.current = null
    alignRef.current = 'idle'
    if (!bead || bead.threaded) return
    const tip = tipRef.current
    const dist = Math.hypot(bead.x - tip.x, bead.y - tip.y)
    if (tryThread(bead)) return
    if (dist < bead.r + 36 * tolRef.current) {
      recordTrial('miss', null, 0)
      setScore((s) => ({ ...s, misses: s.misses + 1 }))
      playTone('error')
      setMessage('还没套住线头，对准再松开～')
    }
    bead.x = bead.homeX
    bead.y = bead.homeY
  }

  const accuracy =
    score.hits + score.misses === 0
      ? 0
      : Math.round((score.hits / (score.hits + score.misses)) * 100)

  return (
    <GameShell title="串珠珠" subtitle="套到线头上 · 往左串成手串">
      <BeadBody
        canvasRef={canvasRef}
        running={running}
        accuracy={accuracy}
        threaded={threaded}
        goal={goal}
        bracelets={bracelets}
        message={message}
        onResize={syncSize}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={releaseDrag}
        onStart={() => {
          if (!begin()) {
            setMessage('今日训练时间已用完')
            return
          }
          const ability = getGameAbility('beadString')
          const g = beadGoalForLevel(ability.level)
          const hole = beadHoleForLevel(ability.level)
          holeRef.current = hole
          tolRef.current = beadToleranceForLevel(ability.level)
          goalRef.current = g
          pileExtraRef.current = beadPileExtraForLevel(ability.level)
          braceletsRef.current = 0
          sparksRef.current = []
          dragIdRef.current = null
          setGoal(g)
          setBracelets(0)
          setScore({ hits: 0, misses: 0 })
          setWristShow({ open: false, styles: [], count: 0 })
          syncSize()
          layoutPile(hole)
          setClinical({ trialCount: g })
          setMessage(`挑珠子套到右边线头上，往左串；穿满 ${g} 颗就成一串`)
          setRunning(true)
          playTone('tick')
        }}
        onEnd={() => {
          setRunning(false)
          dragIdRef.current = null
          setWristShow({ open: false, styles: [], count: 0 })
          setClinical({
            trialCount: goalRef.current,
            focusAvg: accuracy,
          })
          void end({ save: true })
          setMessage(
            braceletsRef.current > 0
              ? `一共串了 ${braceletsRef.current} 串，已保存！`
              : '已保存本局记录',
          )
        }}
      />

      {wristShow.open && (
        <WristCelebrate
          styles={wristShow.styles}
          braceletNo={wristShow.count}
          onContinue={() => {
            setWristShow({ open: false, styles: [], count: 0 })
            startNextBracelet()
          }}
        />
      )}
    </GameShell>
  )
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

function drawSpool(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  ctx.beginPath()
  ctx.ellipse(x + 2, y + 4, 18, 24, 0, 0, Math.PI * 2)
  ctx.fill()
  const wood = ctx.createLinearGradient(x - 16, y, x + 16, y)
  wood.addColorStop(0, '#78350f')
  wood.addColorStop(0.5, '#b45309')
  wood.addColorStop(1, '#92400e')
  ctx.fillStyle = wood
  ctx.beginPath()
  ctx.ellipse(x, y, 17, 23, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.ellipse(x, y, 8, 12, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(254,243,199,0.5)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(x - 2, y - 4, 4, 6, -0.3, 0, Math.PI * 2)
  ctx.stroke()
}

function drawTip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  align: AlignState,
  now: number,
) {
  const pulse = 1 + Math.sin(now * 0.01) * 0.08
  const r =
    align === 'perfect' ? 8 * pulse : align === 'good' ? 7 : align === 'near' ? 6.5 : 5.5
  // Outer glow
  if (align !== 'idle') {
    const glow = ctx.createRadialGradient(x, y, 2, x, y, 22)
    const c =
      align === 'perfect'
        ? '34,197,94'
        : align === 'good'
          ? '250,204,21'
          : '251,146,60'
    glow.addColorStop(0, `rgba(${c},0.55)`)
    glow.addColorStop(1, `rgba(${c},0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(x, y, 22, 0, Math.PI * 2)
    ctx.fill()
  }
  // Metal tip
  const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, r)
  g.addColorStop(0, '#fffbeb')
  g.addColorStop(0.45, '#facc15')
  g.addColorStop(1, '#a16207')
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = '#78350f'
  ctx.lineWidth = 1.6
  ctx.stroke()
  // Specular
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.beginPath()
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, Math.PI * 2)
  ctx.fill()
}

function drawAlignGuide(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  bead: Bead,
  align: AlignState,
) {
  const color =
    align === 'perfect'
      ? 'rgba(34,197,94,0.95)'
      : align === 'good'
        ? 'rgba(234,179,8,0.9)'
        : 'rgba(251,146,60,0.85)'

  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  ctx.arc(tipX, tipY, bead.hole + 4, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(tipX - 10, tipY)
  ctx.lineTo(tipX + 10, tipY)
  ctx.moveTo(tipX, tipY - 10)
  ctx.lineTo(tipX, tipY + 10)
  ctx.stroke()

  if (align === 'perfect' || align === 'good') {
    ctx.fillStyle = color
    ctx.font = '700 14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(
      align === 'perfect' ? '套住啦 · 松开！' : '对准线头',
      tipX,
      tipY - bead.r - 12,
    )
    ctx.textAlign = 'start'
  }
}

/**
 * Candy bead: plain = glossy circle; character kinds = cartoon silhouette charms.
 * Cord sits under threaded beads. Tip drawn later on top while lifting.
 */
function drawBead(
  ctx: CanvasRenderingContext2D,
  b: Bead,
  lifting: boolean,
  onString: boolean,
) {
  const { color, accent, gloss, kind } = b.style
  const r = b.r + (lifting ? 3 : 0)
  const shaped = kind !== 'plain' && kind !== 'rainbow'

  if (!onString || lifting) {
    ctx.fillStyle = 'rgba(15,23,42,0.18)'
    ctx.beginPath()
    ctx.ellipse(
      b.x + 1,
      b.y + r * 0.92,
      r * (shaped ? 0.72 : 0.78),
      r * 0.22,
      0,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }

  const body = ctx.createRadialGradient(
    b.x - r * 0.34,
    b.y - r * 0.42,
    r * 0.02,
    b.x,
    b.y + r * 0.12,
    r * 1.05,
  )
  body.addColorStop(0, '#ffffff')
  body.addColorStop(0.18, gloss)
  body.addColorStop(0.55, color)
  body.addColorStop(1, accent)

  ctx.save()
  beadShapePath(ctx, kind, b.x, b.y, r)
  ctx.fillStyle = body
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.78)'
  ctx.lineWidth = Math.max(1.5, r * 0.07)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(15,23,42,0.12)'
  ctx.lineWidth = 1
  beadShapePath(ctx, kind, b.x, b.y, r)
  ctx.stroke()
  ctx.restore()

  // Face / motif details (clipped to silhouette)
  ctx.save()
  beadShapePath(ctx, kind, b.x, b.y, r)
  ctx.clip()
  drawBeadFace(ctx, kind, b.x, b.y, r, accent)
  // Specular
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.beginPath()
  ctx.ellipse(
    b.x - r * 0.28,
    b.y - r * 0.34,
    r * 0.18,
    r * 0.11,
    -0.5,
    0,
    Math.PI * 2,
  )
  ctx.fill()
  ctx.restore()

  if (lifting) {
    const hr = Math.max(3.2, b.hole * 0.8)
    const hole = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, hr)
    hole.addColorStop(0, 'rgba(255,251,235,0.6)')
    hole.addColorStop(0.55, 'rgba(120,53,15,0.22)')
    hole.addColorStop(1, 'rgba(15,23,42,0.4)')
    ctx.beginPath()
    ctx.arc(b.x, b.y, hr, 0, Math.PI * 2)
    ctx.fillStyle = hole
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

/** Build a closed path for the bead silhouette (circle or cartoon charm). */
function beadShapePath(
  ctx: CanvasRenderingContext2D,
  kind: BeadKind,
  x: number,
  y: number,
  r: number,
) {
  ctx.beginPath()
  switch (kind) {
    case 'star': {
      for (let i = 0; i < 5; i += 1) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5
        const a2 = a + Math.PI / 5
        const fn = i === 0 ? ctx.moveTo.bind(ctx) : ctx.lineTo.bind(ctx)
        fn(x + Math.cos(a) * r, y + Math.sin(a) * r)
        ctx.lineTo(x + Math.cos(a2) * r * 0.45, y + Math.sin(a2) * r * 0.45)
      }
      ctx.closePath()
      break
    }
    case 'heart': {
      // Symmetric candy heart (lobes up, tip down), sized to fit r
      ctx.moveTo(x, y + r * 0.78)
      ctx.bezierCurveTo(
        x - r * 1.02,
        y + r * 0.28,
        x - r * 0.95,
        y - r * 0.72,
        x,
        y - r * 0.32,
      )
      ctx.bezierCurveTo(
        x + r * 0.95,
        y - r * 0.72,
        x + r * 1.02,
        y + r * 0.28,
        x,
        y + r * 0.78,
      )
      ctx.closePath()
      break
    }
    case 'flower': {
      for (let i = 0; i < 6; i += 1) {
        const a = (i * Math.PI * 2) / 6 - Math.PI / 2
        const cx = x + Math.cos(a) * r * 0.48
        const cy = y + Math.sin(a) * r * 0.48
        const pr = r * 0.42
        ctx.moveTo(cx + pr, cy)
        ctx.arc(cx, cy, pr, 0, Math.PI * 2)
      }
      ctx.moveTo(x + r * 0.36, y)
      ctx.arc(x, y, r * 0.36, 0, Math.PI * 2)
      break
    }
    case 'bear': {
      ctx.arc(x - r * 0.55, y - r * 0.55, r * 0.38, 0, Math.PI * 2)
      ctx.moveTo(x + r * 0.55 + r * 0.38, y - r * 0.55)
      ctx.arc(x + r * 0.55, y - r * 0.55, r * 0.38, 0, Math.PI * 2)
      ctx.moveTo(x + r * 0.92, y)
      ctx.arc(x, y + r * 0.06, r * 0.82, 0, Math.PI * 2)
      break
    }
    case 'cat': {
      ctx.moveTo(x - r * 0.85, y - r * 0.15)
      ctx.lineTo(x - r * 0.55, y - r * 0.95)
      ctx.lineTo(x - r * 0.15, y - r * 0.45)
      ctx.closePath()
      ctx.moveTo(x + r * 0.85, y - r * 0.15)
      ctx.lineTo(x + r * 0.55, y - r * 0.95)
      ctx.lineTo(x + r * 0.15, y - r * 0.45)
      ctx.closePath()
      ctx.moveTo(x + r * 0.88, y + r * 0.05)
      ctx.arc(x, y + r * 0.08, r * 0.78, 0, Math.PI * 2)
      break
    }
    case 'duck': {
      ctx.ellipse(x - r * 0.08, y + r * 0.18, r * 0.72, r * 0.55, 0, 0, Math.PI * 2)
      ctx.moveTo(x + r * 0.55, y - r * 0.15)
      ctx.arc(x + r * 0.28, y - r * 0.28, r * 0.42, 0, Math.PI * 2)
      break
    }
    case 'fish': {
      ctx.ellipse(x - r * 0.08, y, r * 0.72, r * 0.5, 0, 0, Math.PI * 2)
      ctx.moveTo(x + r * 0.55, y)
      ctx.lineTo(x + r * 1.05, y - r * 0.48)
      ctx.lineTo(x + r * 1.05, y + r * 0.48)
      ctx.closePath()
      break
    }
    case 'frog': {
      ctx.ellipse(x, y + r * 0.12, r * 0.88, r * 0.62, 0, 0, Math.PI * 2)
      ctx.moveTo(x - r * 0.42 + r * 0.32, y - r * 0.42)
      ctx.arc(x - r * 0.42, y - r * 0.42, r * 0.32, 0, Math.PI * 2)
      ctx.moveTo(x + r * 0.42 + r * 0.32, y - r * 0.42)
      ctx.arc(x + r * 0.42, y - r * 0.42, r * 0.32, 0, Math.PI * 2)
      break
    }
    case 'rainbow': {
      // Soft cloud silhouette
      ctx.arc(x - r * 0.45, y + r * 0.15, r * 0.42, 0, Math.PI * 2)
      ctx.moveTo(x + r * 0.5, y + r * 0.2)
      ctx.arc(x + r * 0.35, y + r * 0.18, r * 0.4, 0, Math.PI * 2)
      ctx.moveTo(x + r * 0.35, y - r * 0.15)
      ctx.arc(x, y - r * 0.05, r * 0.55, 0, Math.PI * 2)
      ctx.moveTo(x + r * 0.15, y + r * 0.45)
      ctx.ellipse(x, y + r * 0.28, r * 0.78, r * 0.38, 0, 0, Math.PI * 2)
      break
    }
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2)
      break
  }
}

function drawBeadFace(
  ctx: CanvasRenderingContext2D,
  kind: BeadKind,
  x: number,
  y: number,
  r: number,
  accent: string,
) {
  const eye = (ex: number, ey: number, s: number) => {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(ex, ey, s, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0f172a'
    ctx.beginPath()
    ctx.arc(ex + s * 0.15, ey + s * 0.1, s * 0.48, 0, Math.PI * 2)
    ctx.fill()
  }

  switch (kind) {
    case 'bear':
      eye(x - r * 0.28, y + r * 0.02, r * 0.14)
      eye(x + r * 0.28, y + r * 0.02, r * 0.14)
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.ellipse(x, y + r * 0.32, r * 0.16, r * 0.12, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'cat':
      eye(x - r * 0.26, y + r * 0.05, r * 0.13)
      eye(x + r * 0.26, y + r * 0.05, r * 0.13)
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.moveTo(x, y + r * 0.22)
      ctx.lineTo(x - r * 0.1, y + r * 0.38)
      ctx.lineTo(x + r * 0.1, y + r * 0.38)
      ctx.closePath()
      ctx.fill()
      break
    case 'duck':
      eye(x + r * 0.32, y - r * 0.35, r * 0.1)
      ctx.fillStyle = '#ea580c'
      ctx.beginPath()
      ctx.moveTo(x + r * 0.48, y - r * 0.22)
      ctx.lineTo(x + r * 0.95, y - r * 0.12)
      ctx.lineTo(x + r * 0.48, y - r * 0.02)
      ctx.closePath()
      ctx.fill()
      break
    case 'fish':
      eye(x - r * 0.25, y - r * 0.08, r * 0.12)
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.lineWidth = Math.max(1.2, r * 0.06)
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath()
        ctx.arc(x - r * 0.05, y, r * (0.28 + i * 0.14), -0.6, 0.6)
        ctx.stroke()
      }
      break
    case 'frog':
      eye(x - r * 0.42, y - r * 0.42, r * 0.14)
      eye(x + r * 0.42, y - r * 0.42, r * 0.14)
      ctx.strokeStyle = accent
      ctx.lineWidth = Math.max(1.5, r * 0.07)
      ctx.beginPath()
      ctx.arc(x, y + r * 0.28, r * 0.28, 0.15, Math.PI - 0.15)
      ctx.stroke()
      break
    case 'flower':
      ctx.fillStyle = '#fde047'
      ctx.beginPath()
      ctx.arc(x, y, r * 0.28, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#f59e0b'
      ctx.beginPath()
      ctx.arc(x, y, r * 0.1, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'heart':
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.beginPath()
      ctx.ellipse(x - r * 0.28, y - r * 0.28, r * 0.14, r * 0.09, -0.6, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'star':
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.beginPath()
      ctx.arc(x - r * 0.1, y - r * 0.15, r * 0.12, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'rainbow': {
      const cols = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8']
      cols.forEach((c, i) => {
        ctx.strokeStyle = c
        ctx.lineWidth = Math.max(1.8, r * 0.09)
        ctx.beginPath()
        ctx.arc(x, y + r * 0.35, r * (0.72 - i * 0.11), Math.PI * 1.05, -0.05)
        ctx.stroke()
      })
      break
    }
    case 'plain':
    default: {
      const emoji = kindEmoji(kind)
      if (emoji) {
        ctx.font = `${Math.round(r * 1.05)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(emoji, x, y + r * 0.04)
      }
      break
    }
  }
}

function kindLabel(kind: BeadKind): string {
  switch (kind) {
    case 'bear':
      return '小熊'
    case 'cat':
      return '小猫'
    case 'star':
      return '星星'
    case 'heart':
      return '爱心'
    case 'duck':
      return '小鸡'
    case 'fish':
      return '小鱼'
    case 'flower':
      return '小花'
    case 'rainbow':
      return '彩虹'
    case 'frog':
      return '青蛙'
    default:
      return '彩珠'
  }
}

function WristCelebrate({
  styles,
  braceletNo,
  onContinue,
}: {
  styles: BeadStyle[]
  braceletNo: number
  onContinue: () => void
}) {
  return (
    <div className="fixed inset-0 z-[66] flex items-center justify-center bg-gradient-to-b from-slate-950/70 to-amber-950/50 p-4 backdrop-blur-md">
      {/* Floating sparkles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 18 }, (_, i) => (
          <span
            key={i}
            className="absolute animate-[beadSparkle_2.4s_ease-in-out_infinite] text-lg"
            style={{
              left: `${8 + ((i * 47) % 84)}%`,
              top: `${10 + ((i * 29) % 70)}%`,
              animationDelay: `${(i % 7) * 0.18}s`,
              opacity: 0.85,
            }}
          >
            {i % 3 === 0 ? '✨' : i % 3 === 1 ? '⭐' : '💫'}
          </span>
        ))}
      </div>

      <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] bg-gradient-to-b from-amber-50 via-white to-rose-50 p-6 text-center shadow-2xl ring-2 ring-amber-200/80">
        <p className="text-sm font-extrabold tracking-wide text-amber-600">
          BRACELET COMPLETE
        </p>
        <h3 className="mt-1 text-3xl font-black text-amber-950">
          第 {braceletNo} 串手串完成！
        </h3>
        <p className="mt-2 text-base font-bold text-amber-800/75">
          瞧，戴在手腕上亮晶晶的～
        </p>

        {/* Stage: arm + bracelet */}
        <div className="relative mx-auto mt-6 h-52 w-full max-w-sm">
          <div className="absolute inset-x-6 top-8 h-36 overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-sky-100/80 to-amber-100/60" />

          {/* Forearm */}
          <div
            className="absolute left-1/2 top-14 h-28 w-44 -translate-x-1/2 rounded-[3rem]"
            style={{
              background:
                'linear-gradient(160deg, #f8d2b0 0%, #e8b48a 45%, #d4956a 100%)',
              boxShadow:
                'inset 0 8px 16px rgba(255,255,255,0.35), inset 0 -10px 18px rgba(120,53,15,0.15)',
            }}
          />
          {/* Wrist crease */}
          <div className="absolute left-1/2 top-[7.25rem] h-2 w-36 -translate-x-1/2 rounded-full bg-amber-900/10" />

          {/* Bracelet arc of beads */}
          <div className="absolute left-1/2 top-10 w-[15.5rem] -translate-x-1/2">
            <div className="relative mx-auto h-24 w-full animate-[braceletBob_2.6s_ease-in-out_infinite]">
              {styles.slice(0, 16).map((s, i) => {
                const n = Math.min(styles.length, 16)
                const t = n <= 1 ? 0.5 : i / (n - 1)
                const angle = -70 + t * 140
                const rad = (angle * Math.PI) / 180
                const radius = 58
                const x = 50 + Math.sin(rad) * radius
                const y = 55 - Math.cos(rad) * 22
                const clip = celebrateClip(s.kind)
                return (
                  <div
                    key={i}
                    className="absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center shadow-md"
                    title={kindLabel(s.kind)}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      background: `radial-gradient(circle at 32% 28%, #fff 0%, ${s.gloss} 18%, ${s.color} 55%, ${s.accent} 100%)`,
                      clipPath: clip,
                      WebkitClipPath: clip,
                      animationDelay: `${i * 0.04}s`,
                    }}
                  >
                    <span className="text-[12px] drop-shadow-sm">
                      {kindEmoji(s.kind)}
                    </span>
                  </div>
                )
              })}
              {/* Cord under beads */}
              <div className="absolute left-1/2 top-[52%] h-1.5 w-40 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-700 via-yellow-400 to-amber-700 opacity-80" />
            </div>
          </div>

          <p className="absolute inset-x-0 bottom-2 text-sm font-extrabold text-amber-900/70">
            {styles.length} 颗精美珠子 · {uniqueKinds(styles)} 种样式
          </p>
        </div>

        <button
          type="button"
          className="mt-5 min-h-14 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-rose-400 text-lg font-black text-white shadow-lg shadow-amber-200"
          onClick={onContinue}
        >
          再串下一串 ✨
        </button>
      </div>

      <style>{`
        @keyframes braceletBob {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-4px) rotate(2deg); }
        }
        @keyframes beadSparkle {
          0%, 100% { transform: scale(0.7) translateY(0); opacity: 0.25; }
          50% { transform: scale(1.15) translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function celebrateClip(kind: BeadKind): string {
  switch (kind) {
    case 'star':
      return 'polygon(50% 2%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)'
    case 'heart':
      return 'polygon(50% 88%, 10% 52%, 8% 28%, 22% 10%, 50% 28%, 78% 10%, 92% 28%, 90% 52%)'
    case 'flower':
      return 'circle(48% at 50% 50%)'
    case 'fish':
      return 'ellipse(48% 38% at 42% 50%)'
    case 'duck':
      return 'ellipse(48% 42% at 48% 55%)'
    case 'bear':
    case 'cat':
    case 'frog':
      return 'circle(46% at 50% 55%)'
    case 'rainbow':
      return 'ellipse(48% 40% at 50% 55%)'
    default:
      return 'circle(50%)'
  }
}

function kindEmoji(kind: BeadKind): string {
  switch (kind) {
    case 'bear':
      return '🐻'
    case 'cat':
      return '🐱'
    case 'star':
      return '⭐'
    case 'heart':
      return '💗'
    case 'duck':
      return '🐥'
    case 'fish':
      return '🐟'
    case 'flower':
      return '🌸'
    case 'rainbow':
      return '🌈'
    case 'frog':
      return '🐸'
    default:
      return ''
  }
}

function uniqueKinds(styles: BeadStyle[]): number {
  return new Set(styles.map((s) => s.kind)).size
}

function BeadBody({
  canvasRef,
  running,
  accuracy,
  threaded,
  goal,
  bracelets,
  message,
  onResize,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onStart,
  onEnd,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  running: boolean
  accuracy: number
  threaded: number
  goal: number
  bracelets: number
  message: string
  onResize: () => void
  onPointerDown: (x: number, y: number) => void
  onPointerMove: (x: number, y: number) => void
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
        <GameHudStat label="本串" value={`${threaded}/${goal}`} />
        <GameHudStat label="完成串数" value={`${bracelets}`} />
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
            ? 'bg-amber-50'
            : 'bg-amber-50 shadow ring-1 ring-amber-100'
        }
        onResize={onResize}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          style={{ cursor: running ? 'grab' : 'default' }}
          onPointerDown={(e) => {
            e.preventDefault()
            ;(e.target as HTMLCanvasElement).setPointerCapture?.(e.pointerId)
            onPointerDown(e.clientX, e.clientY)
          }}
          onPointerMove={(e) => {
            e.preventDefault()
            onPointerMove(e.clientX, e.clientY)
          }}
          onPointerUp={(e) => {
            e.preventDefault()
            onPointerUp()
          }}
          onPointerCancel={() => onPointerUp()}
        />
      </CanvasStage>

      <GameControls>
        {!running ? (
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-amber-500 px-6 py-3 font-extrabold text-white"
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
