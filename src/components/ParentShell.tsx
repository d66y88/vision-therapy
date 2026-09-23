import { useState } from 'react'
import { ColorCalibration } from './ColorCalibration'
import { ParentDashboard } from './ParentDashboard'
import {
  ALLOWED_E_TARGETS_MIN,
  getETargetMs,
  setETargetMs,
  focusSentence,
} from '../lib/focusScore'
import {
  hasParentPin,
  isParentUnlocked,
  lockParentSession,
  setParentPin,
  tryUnlockParent,
} from '../lib/parentPin'
import { getCurrentStreak, getHeatmapDays } from '../lib/streakStore'
import {
  getLiveEffectiveMs,
  getLiveElapsedMs,
  useTrainingTimerStore,
} from '../store/trainingTimerStore'
import { TRAINING_LIMIT_MS } from '../lib/trainingTypes'
import { formatMmSs } from '../store/trainingTimerStore'

type ParentSection =
  | 'dashboard'
  | 'calibration'
  | 'heatmap'
  | 'settings'
  | 'demo'

const SECTIONS: { id: ParentSection; label: string }[] = [
  { id: 'dashboard', label: '趋势' },
  { id: 'heatmap', label: '打卡' },
  { id: 'calibration', label: '校准' },
  { id: 'settings', label: '剂量' },
  { id: 'demo', label: '演示' },
]

/**
 * PIN-gated parent shell: trends, calibration, heatmap, dose settings, clinic demo.
 */
export function ParentShell({
  onExit,
  onStartDemo,
}: {
  onExit: () => void
  onStartDemo: () => void
}) {
  const [unlocked, setUnlocked] = useState(() => isParentUnlocked())
  const [section, setSection] = useState<ParentSection>('dashboard')
  const [pinInput, setPinInput] = useState('')
  const [pinSetup, setPinSetup] = useState('')
  const [pinMsg, setPinMsg] = useState('')

  const exit = () => {
    lockParentSession()
    onExit()
  }

  if (!unlocked) {
    const needsSetup = !hasParentPin()
    return (
      <section className="mx-auto w-full max-w-md px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-black text-slate-800">
          {needsSetup ? '设置家长 PIN' : '家长区已锁定'}
        </h1>
        <p className="mt-3 text-base text-slate-600">
          {needsSetup
            ? '请设置 4–6 位数字，保护看板、清空与导出，避免孩子误触。'
            : '输入 PIN 后可查看趋势、校准、演示与剂量设置。'}
        </p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={needsSetup ? pinSetup : pinInput}
          onChange={(e) =>
            needsSetup
              ? setPinSetup(e.target.value)
              : setPinInput(e.target.value)
          }
          className="mt-5 w-full rounded-2xl border border-slate-200 px-4 py-4 text-xl font-bold tracking-widest"
          placeholder={needsSetup ? '新 PIN' : '输入 PIN'}
        />
        <button
          type="button"
          className="mt-4 min-h-14 w-full rounded-2xl bg-sky-500 text-base font-extrabold text-white"
          onClick={() => {
            try {
              if (needsSetup) {
                setParentPin(pinSetup)
                setUnlocked(true)
                setPinMsg('')
              } else if (tryUnlockParent(pinInput)) {
                setUnlocked(true)
                setPinMsg('')
              } else {
                setPinMsg('PIN 不正确')
              }
            } catch (e) {
              setPinMsg(e instanceof Error ? e.message : '设置失败')
            }
          }}
        >
          {needsSetup ? '保存并进入' : '解锁'}
        </button>
        <button
          type="button"
          className="mt-3 min-h-12 w-full rounded-2xl bg-white text-base font-bold text-slate-600 ring-1 ring-slate-200"
          onClick={exit}
        >
          返回孩子训练
        </button>
        {pinMsg && (
          <p className="mt-3 text-base font-bold text-rose-600">{pinMsg}</p>
        )}
      </section>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-slate-800 sm:text-3xl">
          家长区
        </h1>
        <button
          type="button"
          onClick={exit}
          className="min-h-12 rounded-2xl bg-white px-4 py-2 text-base font-extrabold text-slate-700 ring-1 ring-slate-200"
        >
          返回孩子训练
        </button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={`min-h-12 rounded-2xl px-4 py-2 text-base font-extrabold transition ${
              section === s.id
                ? 'bg-indigo-500 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'dashboard' && <ParentDashboard embedded />}
      {section === 'calibration' && <ColorCalibration />}
      {section === 'heatmap' && <HeatmapPanel />}
      {section === 'settings' && <DoseSettings />}
      {section === 'demo' && (
        <div className="rounded-3xl bg-indigo-50 p-6 ring-1 ring-indigo-100">
          <h2 className="text-2xl font-black text-slate-800">医院演示</h2>
          <p className="mt-2 text-base text-slate-600">
            约 8 分钟：必要时校准 + Gabor 找斑点、红蓝天平、灯光跳跳，讲清分辨 / 双眼 / 眼球运动。
          </p>
          <button
            type="button"
            className="mt-5 min-h-14 rounded-2xl bg-indigo-500 px-6 text-base font-extrabold text-white"
            onClick={() => {
              onStartDemo()
            }}
          >
            开始演示
          </button>
        </div>
      )}
    </div>
  )
}

function HeatmapPanel() {
  const heat = getHeatmapDays(28)
  const streak = getCurrentStreak()
  return (
    <section className="rounded-3xl bg-white p-5 ring-1 ring-sky-100">
      <h2 className="text-2xl font-black text-slate-800">打卡日历</h2>
      <p className="mt-2 text-lg font-bold text-amber-800">
        连续 {streak} 天
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {heat.map((d) => (
          <span
            key={d.dayKey}
            title={d.dayKey}
            className={`h-5 w-5 rounded-md ${
              d.done ? 'bg-emerald-500' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
      <p className="mt-4 text-base text-slate-600">
        断签不羞辱：补练并满足打卡条件即可续上。
      </p>
    </section>
  )
}

function DoseSettings() {
  const [target, setTarget] = useState(() => getETargetMs())
  const elapsedMs = useTrainingTimerStore((s) => s.elapsedMs)
  const effectiveMs = useTrainingTimerStore((s) => s.effectiveMs)
  const phase = useTrainingTimerStore((s) => s.phase)
  const segmentStartedAt = useTrainingTimerStore((s) => s.segmentStartedAt)
  const lastAccrueAt = useTrainingTimerStore((s) => s.lastAccrueAt)
  const focusScore = useTrainingTimerStore((s) => s.focusScore)
  const liveWall = getLiveElapsedMs(
    { elapsedMs, phase, segmentStartedAt, lastAccrueAt, focusScore },
  )
  const liveEff = getLiveEffectiveMs(
    { effectiveMs, phase, segmentStartedAt, lastAccrueAt, focusScore },
  )
  const focusPct = Math.round(
    ((focusScore - 0.7) / (1.25 - 0.7)) * 100,
  )

  return (
    <section className="space-y-4">
      <div className="rounded-3xl bg-white p-5 ring-1 ring-sky-100">
        <h2 className="text-2xl font-black text-slate-800">专注与剂量</h2>
        <p className="mt-2 text-base text-slate-600">
          专心时有效时间攒得更快，可以更早打卡；分心时需要多练一会儿。墙钟最多{' '}
          {TRAINING_LIMIT_MS / 60000} 分钟。
        </p>
        <p className="mt-3 text-base font-bold text-emerald-800">
          {focusSentence(focusPct)}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Stat
            label="今日墙钟"
            value={formatMmSs(liveWall)}
          />
          <Stat
            label="有效专注"
            value={formatMmSs(liveEff)}
          />
        </div>
      </div>

      <div className="rounded-3xl bg-white p-5 ring-1 ring-sky-100">
        <p className="text-lg font-extrabold text-slate-800">
          打卡所需有效分钟
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ALLOWED_E_TARGETS_MIN.map((m) => {
            const ms = m * 60 * 1000
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setETargetMs(ms)
                  setTarget(ms)
                }}
                className={`min-h-12 rounded-2xl px-5 text-base font-extrabold ${
                  target === ms
                    ? 'bg-sky-500 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {m} 分钟
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-base text-slate-500">
          默认 18。还须完成今日必练课表才能打卡。
        </p>
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="text-2xl font-black text-slate-800">{value}</p>
    </div>
  )
}
