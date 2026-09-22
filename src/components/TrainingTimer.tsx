import { useEffect, useMemo, useState } from 'react'
import { getETargetMs, kidDoseMessage } from '../lib/focusScore'
import { isPlaylistComplete } from '../lib/playlistProgress'
import {
  BREAK_DURATION_MS,
  TRAINING_LIMIT_MS,
} from '../lib/trainingTypes'
import {
  formatMmSs,
  getBreakRemainingMs,
  getLiveEffectiveMs,
  getLiveElapsedMs,
  useTrainingTimerStore,
} from '../store/trainingTimerStore'

const REST_TIPS = [
  '向远处绿色景物看看，放松一下眼睛～',
  '慢慢眨眼 10 次，让眼睛润润的',
  '闭上眼睛，轻轻转转眼球',
  '看看窗外，数一数远处有几棵树',
]

/**
 * Kid-facing dose bar: check-in progress via effective minutes (no formulas).
 */
export function TrainingTimer() {
  const phase = useTrainingTimerStore((s) => s.phase)
  const elapsedMs = useTrainingTimerStore((s) => s.elapsedMs)
  const effectiveMs = useTrainingTimerStore((s) => s.effectiveMs)
  const segmentStartedAt = useTrainingTimerStore((s) => s.segmentStartedAt)
  const lastAccrueAt = useTrainingTimerStore((s) => s.lastAccrueAt)
  const focusScore = useTrainingTimerStore((s) => s.focusScore)
  const breakEndsAt = useTrainingTimerStore((s) => s.breakEndsAt)
  const tick = useTrainingTimerStore((s) => s.tick)
  const resetDay = useTrainingTimerStore((s) => s.resetDay)

  const [pulse, setPulse] = useState(0)
  const eTarget = useMemo(() => getETargetMs(), [pulse])

  useEffect(() => {
    const id = window.setInterval(() => {
      tick()
      setPulse((n) => n + 1)
    }, 250)
    return () => window.clearInterval(id)
  }, [tick])

  const liveElapsed = getLiveElapsedMs(
    { elapsedMs, phase, segmentStartedAt, lastAccrueAt, focusScore },
    Date.now(),
  )
  const liveEffective = getLiveEffectiveMs(
    { effectiveMs, phase, segmentStartedAt, lastAccrueAt, focusScore },
    Date.now(),
  )
  const remainBreak = getBreakRemainingMs({ phase, breakEndsAt }, Date.now())
  const playlistDone = isPlaylistComplete()
  const checkInPct = Math.min(100, (liveEffective / eTarget) * 100)
  const message = kidDoseMessage({
    effectiveMs: liveEffective,
    eTargetMs: eTarget,
    playlistDone,
    wallExhausted: liveElapsed >= TRAINING_LIMIT_MS && phase !== 'locked',
  })
  void pulse

  return (
    <>
      <div className="rounded-2xl bg-white/90 px-4 py-3 shadow-sm ring-1 ring-sky-100">
        <div className="flex items-center justify-between gap-3">
          <p className="text-left text-lg font-extrabold text-slate-800">
            {message}
          </p>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-extrabold ${
              phase === 'locked'
                ? 'bg-amber-100 text-amber-800'
                : phase === 'training'
                  ? 'bg-emerald-100 text-emerald-800'
                  : liveElapsed >= TRAINING_LIMIT_MS
                    ? 'bg-slate-200 text-slate-600'
                    : 'bg-sky-100 text-sky-800'
            }`}
          >
            {phase === 'locked'
              ? '休息'
              : phase === 'training'
                ? '训练中'
                : liveElapsed >= TRAINING_LIMIT_MS
                  ? '今日已满'
                  : '打卡进度'}
          </span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
            style={{ width: `${checkInPct}%` }}
          />
        </div>
      </div>

      {phase === 'locked' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-gradient-to-b from-sky-50 to-emerald-50 p-6 text-center shadow-2xl ring-1 ring-white/60">
            <h2 className="text-3xl font-black text-slate-800">
              眼睛休息时间
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              已经练满 {TRAINING_LIMIT_MS / 60000}{' '}
              分钟啦。请远眺 {BREAK_DURATION_MS / 60000} 分钟。
            </p>
            <p className="mt-6 text-5xl font-black tabular-nums text-amber-600">
              {formatMmSs(remainBreak)}
            </p>
            <p className="mt-4 rounded-2xl bg-white/80 px-4 py-3 text-base font-bold text-slate-700">
              {REST_TIPS[Math.floor(remainBreak / 15000) % REST_TIPS.length]}
            </p>
            <div className="mt-6 overflow-hidden rounded-full bg-white">
              <div
                className="h-3 rounded-full bg-amber-400 transition-[width] duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    ((BREAK_DURATION_MS - remainBreak) / BREAK_DURATION_MS) *
                      100,
                  )}%`,
                }}
              />
            </div>
            <DebugSkipButton onSkip={resetDay} />
          </div>
        </div>
      )}
    </>
  )
}

function DebugSkipButton({ onSkip }: { onSkip: () => void }) {
  const [clicks, setClicks] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (clicks === 0) return
    const id = window.setTimeout(() => setClicks(0), 900)
    return () => window.clearTimeout(id)
  }, [clicks])

  if (!visible) {
    return (
      <button
        type="button"
        aria-label="rest-hint"
        className="mt-5 h-8 w-full cursor-default opacity-0"
        onClick={() => {
          const next = clicks + 1
          setClicks(next)
          if (next >= 3) setVisible(true)
        }}
      />
    )
  }

  return (
    <button
      type="button"
      className="mt-5 min-h-12 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-400 ring-1 ring-slate-200"
      onClick={onSkip}
      title="仅用于家长/开发调试"
    >
      跳过休息（调试）
    </button>
  )
}
