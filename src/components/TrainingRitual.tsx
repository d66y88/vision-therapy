import { useEffect, useState } from 'react'
import type { GameId } from '../lib/gameCatalog'
import { gameTitle } from '../lib/gameCatalog'

const OPENING_MS = 10_000
const BETWEEN_MS = 3_000

type RitualKind = 'opening' | 'between' | 'closing' | null

/**
 * Lightweight training ritual overlays: opening goals, between-game celebrate, closing stars.
 */
export function TrainingRitual({
  kind,
  gameId,
  finishedId,
  daysLeft,
  playlistDone,
  stars,
  onDone,
}: {
  kind: RitualKind
  /** For opening: upcoming game. For between: next game to play. */
  gameId?: GameId | null
  /** For between: the game just finished. */
  finishedId?: GameId | null
  daysLeft?: number
  playlistDone?: number
  stars?: number
  onDone: () => void
}) {
  const [remaining, setRemaining] = useState(
    kind === 'opening' ? OPENING_MS : kind === 'between' ? BETWEEN_MS : 4000,
  )

  useEffect(() => {
    if (!kind) return
    const total =
      kind === 'opening' ? OPENING_MS : kind === 'between' ? BETWEEN_MS : 4000
    setRemaining(total)
    const started = Date.now()
    const id = window.setInterval(() => {
      const left = Math.max(0, total - (Date.now() - started))
      setRemaining(left)
      if (left <= 0) {
        window.clearInterval(id)
        onDone()
      }
    }, 200)
    return () => window.clearInterval(id)
  }, [kind, onDone])

  if (!kind) return null

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-[fadeIn_0.4s_ease] rounded-3xl bg-gradient-to-b from-sky-50 via-white to-amber-50 p-6 text-center shadow-2xl ring-1 ring-white/70">
        {kind === 'opening' && (
          <>
            <p className="text-4xl" aria-hidden>
              🐻
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-800">
              小熊教练来啦
            </h2>
            <ul className="mt-4 space-y-2 text-left text-base font-bold text-slate-700">
              <li>① 戴好红蓝眼镜（需要的关卡）</li>
              <li>② 坐直，眼睛离屏幕约一臂远</li>
              <li>③ 跟着今日课表，一关一关慢慢练</li>
            </ul>
            <p className="mt-4 text-base font-semibold text-slate-500">
              {Math.ceil(remaining / 1000)} 秒后开始
              {gameId ? ` · ${gameTitle(gameId)}` : ''}
            </p>
          </>
        )}
        {kind === 'between' && (
          <>
            <p className="text-4xl" aria-hidden>
              ⭐
            </p>
            <h2 className="mt-2 text-2xl font-black text-emerald-700">
              太棒了！
            </h2>
            <p className="mt-2 text-base font-bold text-slate-600">
              {finishedId
                ? `「${gameTitle(finishedId)}」练完啦`
                : '这一关完成啦'}
              {playlistDone != null ? ` · 已完成 ${playlistDone} 关` : ''}
            </p>
            {gameId && (
              <p className="mt-4 text-xl font-black text-sky-700">
                下一关：{gameTitle(gameId)}
              </p>
            )}
          </>
        )}
        {kind === 'closing' && (
          <>
            <p className="text-4xl" aria-hidden>
              {'⭐'.repeat(Math.min(5, Math.max(1, stars ?? 3)))}
            </p>
            <h2 className="mt-2 text-2xl font-black text-amber-700">
              今日训练结算
            </h2>
            <p className="mt-2 text-base font-bold text-slate-600">
              明天还剩 {daysLeft ?? 0} 天换新课表。记得打卡，小熊等你～
            </p>
          </>
        )}
        <button
          type="button"
          className="mt-5 min-h-12 w-full rounded-2xl bg-sky-500 px-4 py-3 text-base font-extrabold text-white"
          onClick={onDone}
        >
          {kind === 'closing' ? '好的' : kind === 'between' ? '下一关' : '跳过'}
        </button>
      </div>
    </div>
  )
}

export type { RitualKind }
