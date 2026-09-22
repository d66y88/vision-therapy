import { useMemo, useState } from 'react'
import {
  GAME_CATALOG,
  getGameDef,
  type GameId,
} from '../lib/gameCatalog'
import {
  getPlaylistProgressSnapshot,
  isCalibrationFresh,
} from '../lib/playlistProgress'
import { getCurrentStreak } from '../lib/streakStore'
import { useColorConfigStore } from '../store/colorConfigStore'

/**
 * Kid home — recommended next CTA + selectable required playlist.
 */
export function HomeHub({
  onPlayGame,
  onNeedCalibration,
}: {
  onPlayGame: (id: GameId) => void
  onNeedCalibration?: () => void
}) {
  const updatedAt = useColorConfigStore((s) => s.updatedAt)
  const calFresh = isCalibrationFresh(updatedAt)
  const [tick, setTick] = useState(0)
  void tick

  const snap = useMemo(() => getPlaylistProgressSnapshot(), [tick])
  const completed = useMemo(() => new Set(snap.completed), [snap.completed])
  const streak = getCurrentStreak()
  const nextGame = snap.next ? getGameDef(snap.next) : null
  const doneCount = snap.games.filter((g) => completed.has(g.id)).length

  const play = (id: GameId) => {
    setTick((n) => n + 1)
    onPlayGame(id)
  }

  return (
    <section className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6">
      <header className="mb-8 text-center sm:text-left">
        <p className="text-5xl font-black tabular-nums text-amber-500">
          {streak}
          <span className="ml-2 text-2xl font-extrabold text-amber-700">
            天连续
          </span>
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-800">
          今日 {doneCount}/{snap.games.length}
        </h1>
      </header>

      {!calFresh && (
        <button
          type="button"
          onClick={() => onNeedCalibration?.()}
          className="mb-5 w-full rounded-2xl bg-rose-100 px-4 py-4 text-left text-base font-extrabold text-rose-800 ring-1 ring-rose-200"
        >
          眼镜关卡需要先校准 →
        </button>
      )}

      {/* Clickable progress dots */}
      <div className="mb-6 flex justify-center gap-3 sm:justify-start">
        {snap.games.map((g) => (
          <button
            key={g.id}
            type="button"
            title={g.title}
            onClick={() => play(g.id)}
            className={`h-5 w-5 rounded-full transition ${
              completed.has(g.id)
                ? 'bg-emerald-500'
                : g.id === snap.next
                  ? 'bg-sky-500 ring-4 ring-sky-200'
                  : 'bg-slate-300'
            }`}
          />
        ))}
      </div>

      {nextGame ? (
        <button
          type="button"
          onClick={() => play(nextGame.id)}
          className={`w-full rounded-[2rem] bg-gradient-to-br p-8 text-left shadow-md ring-1 ring-white/80 transition active:scale-[0.99] ${nextGame.tone}`}
        >
          <p className="text-lg font-bold text-slate-600">推荐下一关</p>
          <p className="mt-2 text-3xl font-black text-slate-900">
            {nextGame.title}
          </p>
          <p className="mt-3 text-lg text-slate-700">{nextGame.short}</p>
          <p className="mt-6 inline-flex min-h-14 items-center rounded-2xl bg-sky-500 px-8 text-lg font-extrabold text-white">
            开始训练
          </p>
        </button>
      ) : (
        <div className="rounded-[2rem] bg-emerald-50 p-8 text-center ring-1 ring-emerald-200">
          <p className="text-3xl font-black text-emerald-800">课表完成！</p>
          <p className="mt-2 text-lg font-bold text-emerald-700">
            专心攒够时间就能打卡
          </p>
        </div>
      )}

      {snap.games.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-lg font-extrabold text-slate-700">
            今日必练
            {nextGame ? (
              <span className="ml-2 text-base font-bold text-slate-500">
                也可以点下面换一关
              </span>
            ) : null}
          </p>
          <div className="grid gap-2">
            {snap.games.map((game, index) => {
              const done = completed.has(game.id)
              const isNext = game.id === snap.next
              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => play(game.id)}
                  className={`flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition active:scale-[0.99] ${
                    isNext
                      ? 'bg-sky-50 ring-sky-300'
                      : done
                        ? 'bg-emerald-50 ring-emerald-200'
                        : 'bg-white ring-slate-200'
                  }`}
                >
                  <span className="text-lg font-extrabold text-slate-800">
                    {index + 1}. {game.title}
                  </span>
                  <span
                    className={`shrink-0 text-base font-bold ${
                      done ? 'text-emerald-700' : 'text-sky-700'
                    }`}
                  >
                    {done ? '再练' : isNext ? '推荐' : '去练'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {snap.allDone && (
        <details className="mt-8 rounded-3xl bg-white/80 p-4 ring-1 ring-sky-100">
          <summary className="cursor-pointer text-lg font-extrabold text-sky-700">
            自由加练
          </summary>
          <div className="mt-3 grid gap-2">
            {GAME_CATALOG.map((game) => (
              <button
                key={game.id}
                type="button"
                onClick={() => play(game.id)}
                className="min-h-14 rounded-2xl bg-slate-50 px-4 py-3 text-left text-lg font-bold text-slate-800 ring-1 ring-slate-200"
              >
                {game.title}
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
