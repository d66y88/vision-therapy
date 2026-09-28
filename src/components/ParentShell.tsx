import { useState } from 'react'
import { ColorCalibration } from './ColorCalibration'
import { ParentDashboard } from './ParentDashboard'
import {
  ALLOWED_E_TARGETS_MIN,
  ALLOWED_WALL_CAPS_MIN,
  getETargetMs,
  getWallCapMs,
  setETargetMs,
  setWallCapMs,
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
import { formatMmSs } from '../store/trainingTimerStore'
import { useTherapyProfileStore } from '../store/therapyProfileStore'
import { useSettingsStore } from '../store/settingsStore'
import { useSyncStore } from '../store/syncStore'

type ParentSection =
  | 'dashboard'
  | 'calibration'
  | 'heatmap'
  | 'settings'
  | 'sync'
  | 'demo'

const SECTIONS: { id: ParentSection; label: string }[] = [
  { id: 'dashboard', label: '趋势' },
  { id: 'heatmap', label: '打卡' },
  { id: 'calibration', label: '校准' },
  { id: 'settings', label: '剂量' },
  { id: 'sync', label: '同步' },
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
      {section === 'sync' && <SyncPanel />}
      {section === 'demo' && (
        <div className="rounded-3xl bg-indigo-50 p-6 ring-1 ring-indigo-100">
          <h2 className="text-2xl font-black text-slate-800">医院演示</h2>
          <p className="mt-2 text-base text-slate-600">
            约 8 分钟：必要时校准 + Gabor 找斑点、红蓝天平、近远跳跳，讲清分辨 / 双眼 / 集合散。
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
  const [wallCap, setWallCapState] = useState(() => getWallCapMs())
  const amblyopicEye = useTherapyProfileStore((s) => s.amblyopicEye)
  const setAmblyopicEye = useTherapyProfileStore((s) => s.setAmblyopicEye)
  const soundOn = useSettingsStore((s) => s.soundOn)
  const setSoundOn = useSettingsStore((s) => s.setSoundOn)
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
          有效时间按真实在任时长计；分心（走神/久不互动/坐太近）会打折，需要多练一会儿。墙钟最多{' '}
          {wallCap / 60000} 分钟。
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
        <p className="text-lg font-extrabold text-slate-800">弱视眼（红蓝通道）</p>
        <p className="mt-2 text-base text-slate-600">
          弱视眼看「要收集 / 宝藏」；另一眼看干扰。各红蓝关开局共用此设置。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['red', 'blue'] as const).map((eye) => (
            <button
              key={eye}
              type="button"
              onClick={() => setAmblyopicEye(eye)}
              className={`min-h-12 rounded-2xl px-5 text-base font-extrabold ${
                amblyopicEye === eye
                  ? 'bg-indigo-500 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {eye === 'red' ? '红眼弱视' : '蓝眼弱视'}
            </button>
          ))}
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

      <div className="rounded-3xl bg-white p-5 ring-1 ring-sky-100">
        <p className="text-lg font-extrabold text-slate-800">每日墙钟上限</p>
        <p className="mt-2 text-base text-slate-600">
          单日训练的硬性时间上限，到顶自动锁定并进入护眼休息。想逼近循证剂量（约
          5–7.5 小时/周）可调高，但请配合休息，避免用眼过度。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ALLOWED_WALL_CAPS_MIN.map((m) => {
            const ms = m * 60 * 1000
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setWallCapMs(ms)
                  setWallCapState(ms)
                }}
                className={`min-h-12 rounded-2xl px-5 text-base font-extrabold ${
                  wallCap === ms
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
          默认 30。训练中每约 12 分钟会有一次 20 秒远眺提醒。
        </p>
      </div>

      <div className="rounded-3xl bg-white p-5 ring-1 ring-sky-100">
        <p className="text-lg font-extrabold text-slate-800">游戏音效</p>
        <p className="mt-2 text-base text-slate-600">
          关闭后训练中不再播放提示音（适合图书馆等安静场合）。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              { on: true, label: '开启' },
              { on: false, label: '静音' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setSoundOn(opt.on)}
              className={`min-h-12 rounded-2xl px-5 text-base font-extrabold ${
                soundOn === opt.on
                  ? 'bg-indigo-500 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

const SYNC_STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  disabled: { text: '仅本地', tone: 'text-slate-500' },
  idle: { text: '未连接', tone: 'text-slate-500' },
  connecting: { text: '同步中…', tone: 'text-amber-600' },
  ready: { text: '已同步', tone: 'text-emerald-600' },
  error: { text: '同步出错', tone: 'text-rose-600' },
}

function SyncPanel() {
  const status = useSyncStore((s) => s.status)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const errorMessage = useSyncStore((s) => s.errorMessage)
  const pendingCode = useSyncStore((s) => s.pendingCode)
  const init = useSyncStore((s) => s.init)
  const manualSync = useSyncStore((s) => s.manualSync)
  const generateCode = useSyncStore((s) => s.generateCode)
  const redeemCode = useSyncStore((s) => s.redeemCode)

  const [codeInput, setCodeInput] = useState('')
  const [redeemMsg, setRedeemMsg] = useState('')

  const label = SYNC_STATUS_LABEL[status] ?? SYNC_STATUS_LABEL.idle

  if (status === 'disabled') {
    return (
      <section className="rounded-3xl bg-white p-5 ring-1 ring-sky-100">
        <h2 className="text-2xl font-black text-slate-800">云同步</h2>
        <p className="mt-3 text-base text-slate-600">
          当前为「仅本地」模式，训练数据只保存在这台设备上，不会上传到云端。
        </p>
        <p className="mt-3 text-base text-slate-500">
          如需在多台设备（如家里和 iPad）间同步进度，请在部署时配置 Supabase
          环境变量后重新加载。数据按家庭隔离、匿名保存，不收集孩子的姓名等个人信息。
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="rounded-3xl bg-white p-5 ring-1 ring-sky-100">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-black text-slate-800">云同步</h2>
          <span className={`text-base font-extrabold ${label.tone}`}>
            {label.text}
          </span>
        </div>
        <p className="mt-2 text-base text-slate-600">
          进度、连胜、贴纸与设置会匿名同步到云端，按家庭隔离，不收集孩子个人信息。
        </p>
        {lastSyncedAt && (
          <p className="mt-2 text-sm text-slate-500">
            上次同步：{new Date(lastSyncedAt).toLocaleString('zh-CN')}
          </p>
        )}
        {errorMessage && (
          <p className="mt-2 text-sm font-bold text-rose-600">{errorMessage}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void manualSync()}
            disabled={status === 'connecting'}
            className="min-h-12 rounded-2xl bg-sky-500 px-5 text-base font-extrabold text-white disabled:opacity-60"
          >
            立即同步
          </button>
          {status === 'error' && (
            <button
              type="button"
              onClick={() => void init()}
              className="min-h-12 rounded-2xl bg-white px-5 text-base font-extrabold text-slate-700 ring-1 ring-slate-200"
            >
              重试连接
            </button>
          )}
        </div>
      </div>

      <div className="rounded-3xl bg-white p-5 ring-1 ring-sky-100">
        <p className="text-lg font-extrabold text-slate-800">在新设备上添加</p>
        <p className="mt-2 text-base text-slate-600">
          在这台设备生成同步码，然后到另一台设备（如 iPad）输入即可共享同一份进度。
          同步码 24 小时内有效。
        </p>
        <button
          type="button"
          onClick={() => void generateCode()}
          disabled={status !== 'ready'}
          className="mt-3 min-h-12 rounded-2xl bg-indigo-500 px-5 text-base font-extrabold text-white disabled:opacity-60"
        >
          生成同步码
        </button>
        {pendingCode && (
          <div className="mt-4 rounded-2xl bg-indigo-50 px-4 py-4 text-center ring-1 ring-indigo-100">
            <p className="text-sm font-bold text-indigo-500">同步码</p>
            <p className="mt-1 text-4xl font-black tracking-[0.3em] text-indigo-700">
              {pendingCode}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              到另一台设备输入此码，24 小时内有效。
            </p>
          </div>
        )}
      </div>

      <div className="rounded-3xl bg-white p-5 ring-1 ring-sky-100">
        <p className="text-lg font-extrabold text-slate-800">输入同步码</p>
        <p className="mt-2 text-base text-slate-600">
          在这台设备输入另一台生成的同步码，即可加入同一家庭、合并进度。
        </p>
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
          maxLength={8}
          placeholder="如 A1B2C3"
          className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-4 text-2xl font-black uppercase tracking-[0.3em]"
        />
        <button
          type="button"
          onClick={async () => {
            setRedeemMsg('')
            const ok = await redeemCode(codeInput)
            setRedeemMsg(ok ? '已加入并同步 ✓' : '兑换失败，请检查同步码')
            if (ok) setCodeInput('')
          }}
          disabled={status === 'connecting' || codeInput.trim().length < 4}
          className="mt-3 min-h-12 w-full rounded-2xl bg-sky-500 text-base font-extrabold text-white disabled:opacity-60"
        >
          兑换并同步
        </button>
        {redeemMsg && (
          <p className="mt-3 text-base font-bold text-slate-700">{redeemMsg}</p>
        )}
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
