import { useEffect, useMemo, useRef, useState } from 'react'
import {
  GameControls,
  GameHud,
  GameHudStat,
  GameShell,
  useGameShell,
} from '../GameShell'
import { useTrainingSession } from '../../hooks/useTrainingSession'
import { playTone } from '../../lib/audio'
import { toBlueCss, toRedCss } from '../../lib/colorConfig'
import { useColorConfigStore } from '../../store/colorConfigStore'

type CardColor = 'red' | 'blue'
interface Card {
  id: number
  symbol: string
  channel: CardColor
  matched: boolean
}

const SYMBOLS = ['★', '●', '▲', '■', '◆', '♥']

function buildDeck(): Card[] {
  const picks = SYMBOLS.slice(0, 6)
  const cards: Card[] = []
  let id = 1
  for (const symbol of picks) {
    cards.push({ id: id++, symbol, channel: 'red', matched: false })
    cards.push({ id: id++, symbol, channel: 'blue', matched: false })
  }
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

/**
 * Dichoptic memory: match same symbol across red/blue channels.
 */
export function MemoryMatchGame() {
  const { begin, end, recordTrial, locked } = useTrainingSession('memory')
  const redCss = toRedCss(useColorConfigStore((s) => s.redR))
  const blueCss = toBlueCss(
    useColorConfigStore((s) => s.blueG),
    useColorConfigStore((s) => s.blueB),
  )

  const [running, setRunning] = useState(false)
  const [cards, setCards] = useState<Card[]>([])
  const [flipped, setFlipped] = useState<number[]>([])
  const [lockBoard, setLockBoard] = useState(false)
  const [score, setScore] = useState({ hits: 0, misses: 0 })
  const [message, setMessage] = useState('戴眼镜：翻开一红一蓝，符号相同即配对')

  const flippedRef = useRef<number[]>([])
  const lockRef = useRef(false)
  const cardsRef = useRef<Card[]>([])
  const endingRef = useRef(false)

  flippedRef.current = flipped
  lockRef.current = lockBoard
  cardsRef.current = cards

  useEffect(() => {
    if (locked && running) {
      setRunning(false)
      void end({ save: true })
      setMessage('今日训练时间到，先休息～')
    }
  }, [locked, running, end])

  const remain = useMemo(
    () => cards.filter((c) => !c.matched).length,
    [cards],
  )

  const onFlip = (id: number) => {
    if (!running || lockRef.current) return
    const card = cardsRef.current.find((c) => c.id === id)
    if (!card || card.matched || flippedRef.current.includes(id)) return
    if (flippedRef.current.length >= 2) return

    const nextFlipped = [...flippedRef.current, id]
    flippedRef.current = nextFlipped
    setFlipped(nextFlipped)
    playTone('tick')

    if (nextFlipped.length < 2) return

    const [aId, bId] = nextFlipped
    const a = cardsRef.current.find((c) => c.id === aId)!
    const b = cardsRef.current.find((c) => c.id === bId)!
    lockRef.current = true
    setLockBoard(true)

    window.setTimeout(() => {
      if (a.symbol === b.symbol && a.channel !== b.channel) {
        recordTrial('hit', null, 1)
        playTone('success')
        setCards((prev) => {
          const next = prev.map((c) =>
            c.id === aId || c.id === bId ? { ...c, matched: true } : c,
          )
          cardsRef.current = next
          const left = next.filter((c) => !c.matched).length
          if (left === 0 && !endingRef.current) {
            endingRef.current = true
            setMessage('全部配对！太棒了～')
            setRunning(false)
            void end({ save: true })
          }
          return next
        })
        setScore((s) => ({ ...s, hits: s.hits + 1 }))
        if (!endingRef.current) setMessage('配对成功！双眼都看见了～')
      } else {
        recordTrial('miss', null, 0)
        playTone('error')
        setScore((s) => ({ ...s, misses: s.misses + 1 }))
        setMessage(
          a.channel === b.channel
            ? '要一红一蓝才算配对哦'
            : '符号不一样，再试试',
        )
      }
      flippedRef.current = []
      setFlipped([])
      lockRef.current = false
      setLockBoard(false)
    }, 750)
  }

  return (
    <GameShell title="红蓝翻翻乐" subtitle="抗抑制记忆 · 需红蓝眼镜">
      <MemoryBody
        cards={cards}
        running={running}
        score={score}
        remain={remain}
        message={message}
        redCss={redCss}
        blueCss={blueCss}
        flipped={flipped}
        onFlip={onFlip}
        onStart={() => {
          if (!begin()) {
            setMessage('今日训练时间已用完')
            return
          }
          endingRef.current = false
          const deck = buildDeck()
          cardsRef.current = deck
          flippedRef.current = []
          lockRef.current = false
          setCards(deck)
          setFlipped([])
          setLockBoard(false)
          setScore({ hits: 0, misses: 0 })
          setRunning(true)
          setMessage('戴眼镜：翻开一红一蓝，符号相同即配对')
          playTone('tick')
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

function MemoryBody({
  cards,
  running,
  score,
  remain,
  message,
  redCss,
  blueCss,
  flipped,
  onFlip,
  onStart,
  onEnd,
}: {
  cards: Card[]
  running: boolean
  score: { hits: number; misses: number }
  remain: number
  message: string
  redCss: string
  blueCss: string
  flipped: number[]
  onFlip: (id: number) => void
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
        <GameHudStat label="配对" value={`${score.hits}`} />
        <GameHudStat label="失误" value={`${score.misses}`} />
        <GameHudStat label="剩余" value={`${remain}`} />
        {isFullscreen && (
          <p className="ml-auto self-center text-base font-bold text-white/80">{message}</p>
        )}
      </GameHud>
      {!isFullscreen && (
        <p className="mb-3 text-center text-base font-extrabold text-slate-700">{message}</p>
      )}

      <div
        className={
          isFullscreen
            ? 'relative min-h-0 flex-1 overflow-auto'
            : 'relative overflow-hidden rounded-3xl ring-1 ring-slate-200'
        }
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg,#1a1a1a 0 16px,#ececec 16px 32px)',
        }}
      >
        <div className="absolute inset-0 bg-slate-950/40" />
        <div
          className={
            isFullscreen
              ? 'relative z-[1] grid min-h-full grid-cols-3 content-center gap-3 p-4 sm:grid-cols-4'
              : 'relative z-[1] grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 sm:gap-3'
          }
        >
          {cards.map((card) => {
            const open = card.matched || flipped.includes(card.id)
            const color = card.channel === 'red' ? redCss : blueCss
            return (
              <button
                key={card.id}
                type="button"
                disabled={!running || card.matched || lockBoardLike(flipped)}
                onClick={() => onFlip(card.id)}
                className={
                  isFullscreen
                    ? 'flex min-h-[18vmin] items-center justify-center rounded-2xl text-4xl font-black shadow-sm transition active:scale-95 disabled:opacity-70'
                    : 'flex min-h-20 items-center justify-center rounded-2xl text-3xl font-black shadow-sm ring-1 ring-slate-200 transition active:scale-95 disabled:opacity-70 sm:min-h-24'
                }
                style={{
                  background: open ? color : '#1e293b',
                  color: open ? '#fff' : '#94a3b8',
                }}
              >
                {open ? card.symbol : '?'}
              </button>
            )
          })}
        </div>
      </div>

      <GameControls>
        {!running ? (
          <button type="button" className="min-h-12 rounded-2xl bg-emerald-500 px-6 py-3 font-extrabold text-white" onClick={onStart}>
            开始训练
          </button>
        ) : (
          <button
            type="button"
            className={isFullscreen ? 'min-h-12 rounded-2xl bg-white px-6 py-3 font-extrabold text-slate-900' : 'min-h-12 rounded-2xl bg-white px-6 py-3 font-extrabold text-slate-700 ring-1 ring-slate-200'}
            onClick={onEnd}
          >
            结束并保存
          </button>
        )}
      </GameControls>
    </div>
  )
}

function lockBoardLike(flipped: number[]): boolean {
  return flipped.length >= 2
}
