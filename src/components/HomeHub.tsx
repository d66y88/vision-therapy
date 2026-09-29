import { useMemo, useState } from 'react'
import { getETargetMs } from '../lib/focusScore'
import {
  getGameAbility,
  levelLabel,
  levelTone,
  takeRecentLevelUp,
} from '../lib/abilityProfile'
import {
  focusEmoji,
  GAME_CATALOG,
  gameTitle,
  getGameDef,
  type GameId,
} from '../lib/gameCatalog'
import {
  getPlaylistProgressSnapshot,
  isCalibrationFresh,
} from '../lib/playlistProgress'
import { getStickerShelf, takeNewSticker } from '../lib/rewardsStore'
import { getCurrentStreak } from '../lib/streakStore'
import { useColorConfigStore } from '../store/colorConfigStore'
import {
  getLiveEffectiveMs,
  useTrainingTimerStore,
} from '../store/trainingTimerStore'

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

  // Consume one-time celebrations on mount (persist until home is shown).
  const [levelUp] = useState(() => takeRecentLevelUp())
  const [newSticker] = useState(() => takeNewSticker())

  const effectiveMs = useTrainingTimerStore((s) => s.effectiveMs)
  const phase = useTrainingTimerStore((s) => s.phase)
  const segmentStartedAt = useTrainingTimerStore((s) => s.segmentStartedAt)
  const lastAccrueAt = useTrainingTimerStore((s) => s.lastAccrueAt)
  const focusScore = useTrainingTimerStore((s) => s.focusScore)

  const liveEff = getLiveEffectiveMs({
    effectiveMs,
    phase,
    segmentStartedAt,
    lastAccrueAt,
    focusScore,
  })
  const eTarget = getETargetMs()
  const dosePct = Math.min(100, (liveEff / eTarget) * 100)

  const snap = useMemo(() => getPlaylistProgressSnapshot(), [tick])
  const completed = useMemo(() => new Set(snap.completed), [snap.completed])
  const streak = getCurrentStreak()
  const nextGame = snap.next ? getGameDef(snap.next) : null
  const doneCount = snap.games.filter((g) => completed.has(g.id)).length
  const canFreePlay = doneCount >= 1
  const shelf = useMemo(() => getStickerShelf(), [tick])
  const requiredIds = useMemo(
    () => new Set(snap.games.map((g) => g.id)),
    [snap.games],
  )
  const extraGames = useMemo(
    () => GAME_CATALOG.filter((g) => !requiredIds.has(g.id)),
    [requiredIds],
  )

  const play = (id: GameId) => {
    setTick((n) => n + 1)
    onPlayGame(id)
  }

  return (
    <section className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6">
      <header className="mb-6 text-center sm:text-left">
        <p className="text-5xl font-black tabular-nums text-amber-500">
          {streak}
          <span className="ml-2 text-2xl font-extrabold text-amber-700">
            天连续
          </span>
        </p>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-800 sm:text-4xl">
          课表 {doneCount}/{snap.games.length}
        </h1>
        <p className="mt-2 text-base font-bold text-slate-600">
          关打完还要专心攒时间，才能打卡
        </p>
      </header>

      {(newSticker || levelUp) && (
        <div className="mb-5 space-y-2">
          {newSticker && (
            <div className="rounded-2xl bg-gradient-to-r from-amber-100 to-yellow-50 px-4 py-3 text-base font-extrabold text-amber-800 ring-1 ring-amber-200">
              <span className="mr-2 text-2xl">{newSticker.emoji}</span>
              解锁新贴纸「{newSticker.name}」！坚持真棒
            </div>
          )}
          {levelUp && (
            <div className="rounded-2xl bg-gradient-to-r from-fuchsia-100 to-violet-50 px-4 py-3 text-base font-extrabold text-fuchsia-800 ring-1 ring-fuchsia-200">
              🎉「{gameTitle(levelUp.id)}」升级到{levelLabel(levelUp.level)}，更好玩了！
            </div>
          )}
        </div>
      )}

      <div className="mb-5 rounded-2xl bg-white/90 px-4 py-3 ring-1 ring-amber-100">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-1 text-sm font-extrabold text-slate-700">贴纸墙</p>
          {shelf.map((s) => (
            <span
              key={s.days}
              title={`连续 ${s.days} 天 · ${s.name}`}
              className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-lg ${
                s.earned
                  ? 'bg-amber-100 ring-1 ring-amber-300'
                  : 'bg-slate-100 text-slate-300 grayscale'
              }`}
            >
              {s.earned ? s.emoji : '🔒'}
            </span>
          ))}
        </div>
      </div>

      {!calFresh && (
        <button
          type="button"
          onClick={() => onNeedCalibration?.()}
          className="mb-5 w-full rounded-2xl bg-rose-100 px-4 py-4 text-left text-base font-extrabold text-rose-800 ring-1 ring-rose-200"
        >
          眼镜关卡需要先校准 →
        </button>
      )}

      <div className="mb-6 flex flex-wrap justify-center gap-3 sm:justify-start">
        {snap.games.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => play(g.id)}
            className={`relative flex min-h-11 min-w-11 flex-col items-center justify-center rounded-2xl px-2 py-1.5 text-xs font-extrabold transition ${
              completed.has(g.id)
                ? 'bg-emerald-500 text-white'
                : g.id === snap.next
                  ? 'bg-sky-500 text-white ring-4 ring-sky-200'
                  : 'bg-slate-200 text-slate-700'
            }`}
          >
            <span className="text-base leading-none">{focusEmoji(g.focus)}</span>
            <span className="mt-0.5">{g.abbr}</span>
            {g.needsGlasses && (
              <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1 text-[10px] text-white">
                镜
              </span>
            )}
          </button>
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
            {nextGame.needsGlasses ? ' · 需眼镜' : ''}
          </p>
          <p className="mt-3 text-lg text-slate-700">{nextGame.short}</p>
          <p className="mt-2 text-base font-bold text-slate-500">
            {nextGame.minutesHint}
          </p>
          <p className="mt-6 inline-flex min-h-14 items-center rounded-2xl bg-sky-500 px-8 text-lg font-extrabold text-white">
            开始训练
          </p>
        </button>
      ) : (
        <div className="rounded-[2rem] bg-emerald-50 p-8 text-center ring-1 ring-emerald-200">
          <p className="text-3xl font-black text-emerald-800">课表完成！</p>
          <p className="mt-2 text-lg font-bold text-emerald-700">
            {dosePct >= 100
              ? '时间也够啦，今日可打卡'
              : '再专心练一会儿，攒满打卡时间'}
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
              const level = getGameAbility(game.id).level
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
                  <span className="min-w-0">
                    <span className="block text-lg font-extrabold text-slate-800">
                      {index + 1}. {focusEmoji(game.focus)} {game.title}
                      {game.needsGlasses ? (
                        <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                          眼镜
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-500">
                        {game.minutesHint}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${levelTone(level)}`}
                      >
                        {levelLabel(level)}
                      </span>
                    </span>
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

      {canFreePlay && extraGames.length > 0 && (
        <details className="mt-8 rounded-3xl bg-white/80 p-4 ring-1 ring-sky-100">
          <summary className="cursor-pointer text-lg font-extrabold text-sky-700">
            自由加练
            <span className="ml-2 text-sm font-bold text-slate-500">
              课表之外的关卡
            </span>
          </summary>
          <div className="mt-3 grid gap-2">
            {extraGames.map((game) => (
              <button
                key={game.id}
                type="button"
                onClick={() => play(game.id)}
                className="min-h-14 rounded-2xl bg-slate-50 px-4 py-3 text-left text-lg font-bold text-slate-800 ring-1 ring-slate-200"
              >
                {focusEmoji(game.focus)} {game.title}
                {game.needsGlasses ? ' · 眼镜' : ''}
                <span className="ml-2 text-sm font-semibold text-slate-500">
                  {game.minutesHint}
                </span>
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
