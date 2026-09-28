import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { levelLabel, levelTone, loadAbilityProfile } from '../lib/abilityProfile'
import {
  BINOCULAR_SHARE_TARGET_PCT,
  computeWeeklyDose,
  WEEKLY_TRAINING_DAYS_TARGET,
} from '../lib/doseSummary'
import { focusSentence, getETargetMs } from '../lib/focusScore'
import { gameTitle, type GameId } from '../lib/gameCatalog'
import {
  clearParentPin,
  hasParentPin,
  setParentPin,
} from '../lib/parentPin'
import { exportStreakSummary } from '../lib/streakStore'
import {
  clearTrainingSessions,
  exportTrainingSessionsJson,
  listTrainingSessions,
} from '../lib/trainingDb'
import type { TrainingSession } from '../lib/trainingTypes'
import {
  getLiveEffectiveMs,
  getLiveElapsedMs,
  useTrainingTimerStore,
} from '../store/trainingTimerStore'
import { formatMmSs } from '../store/trainingTimerStore'

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  const mm = `${d.getMonth() + 1}`.padStart(2, '0')
  const dd = `${d.getDate()}`.padStart(2, '0')
  const hh = `${d.getHours()}`.padStart(2, '0')
  const mi = `${d.getMinutes()}`.padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

function moduleLabel(module: TrainingSession['module']): string {
  return gameTitle(module)
}

function bciSentence(bci: number | undefined): string {
  if (bci == null) return '今天还没有分视数据，练完红蓝关卡后会生成双眼协作指数。'
  if (bci >= 70) return `今天两只眼睛配合得更好了（BCI ${bci}）。`
  if (bci >= 40) return `今天双眼还在磨合中（BCI ${bci}），坚持戴眼镜会更稳。`
  return `今天弱视眼参与偏少（BCI ${bci}），请确认眼镜与校准。`
}

function clinicalCell(s: TrainingSession): string {
  const c = s.clinical
  if (!c) return '—'
  if (c.finalDisparityPx != null) return `视差 ${Math.round(c.finalDisparityPx)}px`
  if (c.meanSaccadeRtMs != null) return `扫视 ${c.meanSaccadeRtMs}ms`
  if (c.meanCatchRtMs != null) return `注视 ${c.meanCatchRtMs}ms`
  if (c.meanVergenceRtMs != null) return `近远 ${c.meanVergenceRtMs}ms`
  if (c.fellowContrast != null) {
    return `天平 ${Math.round(c.fellowContrast * 100)}%`
  }
  if (c.finalContrast != null) return `C ${c.finalContrast.toFixed(3)}`
  if (c.bci != null) return `BCI ${c.bci}`
  return '—'
}

function clinicalKidNote(sessions: TrainingSession[]): string {
  const latest = [...sessions].reverse().find((s) => s.clinical)
  const c = latest?.clinical
  if (!c) return '练完新关卡后，这里会多一句立体视 / 扫视 / 天平的小结。'
  if (c.finalDisparityPx != null) {
    return c.finalDisparityPx <= 16
      ? `立体视练到很细（视差约 ${Math.round(c.finalDisparityPx)}px），深度分辨不错。`
      : `立体视还在爬坡（视差约 ${Math.round(c.finalDisparityPx)}px），戴稳眼镜多练「谁更近」。`
  }
  if (c.meanSaccadeRtMs != null) {
    return c.meanSaccadeRtMs <= 700
      ? `扫视反应约 ${c.meanSaccadeRtMs}ms，跳得又快又准。`
      : `扫视平均 ${c.meanSaccadeRtMs}ms，可多练「灯光跳跳」练眼跳。`
  }
  if (c.meanCatchRtMs != null) {
    return c.meanCatchRtMs <= 600
      ? `注视抓住约 ${c.meanCatchRtMs}ms，停住时很稳。`
      : `注视反应约 ${c.meanCatchRtMs}ms，可多练「盯住小光点」。`
  }
  if (c.meanVergenceRtMs != null) {
    return c.meanVergenceRtMs <= 800
      ? `近远跳反应约 ${c.meanVergenceRtMs}ms，集合散节奏不错。`
      : `近远跳约 ${c.meanVergenceRtMs}ms，可多练「近远跳跳」。`
  }
  if (c.fellowContrast != null) {
    return c.fellowContrast <= 0.55
      ? `红蓝天平已把健眼对比压到约 ${Math.round(c.fellowContrast * 100)}%，抗抑制挑战不错。`
      : `天平健眼对比约 ${Math.round(c.fellowContrast * 100)}%，继续让弱视眼多找宝藏。`
  }
  return bciSentence(c.bci)
}

/**
 * Parent trends / export. When `embedded`, PIN is handled by ParentShell.
 */
export function ParentDashboard({ embedded = false }: { embedded?: boolean }) {
  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pinSetup, setPinSetup] = useState('')
  const [pinMsg, setPinMsg] = useState('')

  const elapsedMs = useTrainingTimerStore((s) => s.elapsedMs)
  const effectiveMs = useTrainingTimerStore((s) => s.effectiveMs)
  const phase = useTrainingTimerStore((s) => s.phase)
  const segmentStartedAt = useTrainingTimerStore((s) => s.segmentStartedAt)
  const lastAccrueAt = useTrainingTimerStore((s) => s.lastAccrueAt)
  const focusScore = useTrainingTimerStore((s) => s.focusScore)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await listTrainingSessions()
      setSessions(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取训练记录失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const chartData = useMemo(
    () =>
      sessions.map((s, i) => ({
        idx: i + 1,
        label: formatShortDate(s.startedAt),
        accuracy: s.accuracy,
        reaction: s.avgReactionMs ?? null,
        durationMin: Math.round((s.durationMs / 60000) * 10) / 10,
        contrast: s.clinical?.finalContrast ?? null,
        bci: s.clinical?.bci ?? null,
        focus: s.clinical?.focusAvg ?? null,
        module: moduleLabel(s.module),
      })),
    [sessions],
  )

  const latestBci = useMemo(() => {
    for (let i = sessions.length - 1; i >= 0; i -= 1) {
      const b = sessions[i]?.clinical?.bci
      if (b != null) return b
    }
    return undefined
  }, [sessions])

  const latestFocus = useMemo(() => {
    for (let i = sessions.length - 1; i >= 0; i -= 1) {
      const f = sessions[i]?.clinical?.focusAvg
      if (f != null) return f
    }
    return undefined
  }, [sessions])

  const weekly = useMemo(
    () => computeWeeklyDose(sessions, getETargetMs()),
    [sessions],
  )

  const perGame = useMemo(() => {
    const map = new Map<
      string,
      { module: string; count: number; bestAcc: number; last: string }
    >()
    for (const s of sessions) {
      const cur =
        map.get(s.module) ??
        { module: s.module, count: 0, bestAcc: 0, last: s.startedAt }
      cur.count += 1
      cur.bestAcc = Math.max(cur.bestAcc, s.accuracy)
      if (s.startedAt > cur.last) cur.last = s.startedAt
      map.set(s.module, cur)
    }
    const ability = loadAbilityProfile()
    return [...map.values()]
      .map((g) => ({ ...g, level: ability[g.module as GameId]?.level ?? 0 }))
      .sort((a, b) => b.count - a.count)
  }, [sessions])

  const summary = useMemo(() => {
    if (sessions.length === 0) {
      return { count: 0, avgAcc: 0, avgRt: null as number | null, totalMin: 0 }
    }
    const avgAcc =
      sessions.reduce((a, s) => a + s.accuracy, 0) / sessions.length
    const rts = sessions
      .map((s) => s.avgReactionMs)
      .filter((v): v is number => v != null)
    const avgRt =
      rts.length === 0 ? null : rts.reduce((a, b) => a + b, 0) / rts.length
    const totalMin = sessions.reduce((a, s) => a + s.durationMs, 0) / 60000
    return { count: sessions.length, avgAcc, avgRt, totalMin }
  }, [sessions])

  const liveWall = getLiveElapsedMs({
    elapsedMs,
    phase,
    segmentStartedAt,
    lastAccrueAt,
    focusScore,
  })
  const liveEff = getLiveEffectiveMs({
    effectiveMs,
    phase,
    segmentStartedAt,
    lastAccrueAt,
    focusScore,
  })

  return (
    <section className={embedded ? '' : 'mx-auto w-full max-w-4xl px-4 py-6 sm:px-6'}>
      {!embedded && (
        <header className="mb-5 text-left">
          <h1 className="text-3xl font-black text-slate-800">训练趋势</h1>
        </header>
      )}

      <p className="mb-3 rounded-2xl bg-emerald-50 px-4 py-3 text-base font-bold text-emerald-900 ring-1 ring-emerald-200">
        {focusSentence(latestFocus)}
      </p>
      <p className="mb-4 rounded-2xl bg-sky-50 px-4 py-3 text-base font-bold text-sky-900 ring-1 ring-sky-200">
        {bciSentence(latestBci)}
      </p>
      <p className="mb-4 rounded-2xl bg-violet-50 px-4 py-3 text-base font-bold text-violet-900 ring-1 ring-violet-200">
        {clinicalKidNote(sessions)}
      </p>
      <p className="mb-4 text-base font-bold text-slate-600">
        今日墙钟 {formatMmSs(liveWall)} · 有效专注 {formatMmSs(liveEff)}
        <span className="ml-2 text-slate-500">
          （有效时间=真实在任时长，分心会打折）
        </span>
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="训练次数" value={`${summary.count}`} />
        <Stat label="平均准确率" value={`${summary.avgAcc.toFixed(0)}%`} />
        <Stat
          label="平均反应时"
          value={
            summary.avgRt == null ? '—' : `${Math.round(summary.avgRt)}ms`
          }
        />
        <Stat label="累计时长" value={`${summary.totalMin.toFixed(1)}分`} />
      </div>

      <div className="mb-4 rounded-3xl bg-white/90 p-4 ring-1 ring-sky-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base font-extrabold text-slate-700">本周剂量</p>
          <p className="text-base font-bold tabular-nums text-sky-700">
            {weekly.onTaskMin} / {weekly.targetMin} 分钟
          </p>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-sky-500 transition-[width] duration-300"
            style={{
              width: `${weekly.targetMin > 0 ? Math.min(100, (weekly.onTaskMin / weekly.targetMin) * 100) : 0}%`,
            }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-emerald-200">
            本周训练 {weekly.daysTrained}/{WEEKLY_TRAINING_DAYS_TARGET} 天
          </span>
          <span
            className={`rounded-full px-3 py-1 ring-1 ${
              weekly.binocularPct >= BINOCULAR_SHARE_TARGET_PCT
                ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                : 'bg-amber-50 text-amber-700 ring-amber-200'
            }`}
          >
            双眼类占比 {weekly.binocularPct}%
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          循证的双眼数字疗法常见约 5–7.5 小时/周（300–450 分钟）。
          {weekly.binocularPct < BINOCULAR_SHARE_TARGET_PCT
            ? ' 本周双眼/抗抑制占比偏低，建议多安排红蓝天平、小熊冒险等双眼关。'
            : ' 在任时间为真实训练时长，专心不缩短应练时长。'}
        </p>
      </div>

      {perGame.length > 0 && (
        <div className="mb-4 rounded-3xl bg-white/90 p-4 ring-1 ring-sky-100">
          <p className="mb-3 text-base font-extrabold text-slate-700">
            各关难度与最佳
          </p>
          <div className="grid gap-2">
            {perGame.map((g) => (
              <div
                key={g.module}
                className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200"
              >
                <span className="min-w-0">
                  <span className="block text-base font-extrabold text-slate-800">
                    {moduleLabel(g.module as GameId)}
                  </span>
                  <span className="text-sm font-semibold text-slate-500">
                    练 {g.count} 次 · 最佳 {g.bestAcc.toFixed(0)}% · 末次{' '}
                    {formatShortDate(g.last)}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${levelTone(g.level)}`}
                >
                  {levelLabel(g.level)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void refresh()}
          className="min-h-12 rounded-2xl bg-sky-500 px-5 py-3 text-base font-extrabold text-white"
        >
          刷新
        </button>
        <button
          type="button"
          onClick={async () => {
            const json = await exportTrainingSessionsJson()
            const ability = loadAbilityProfile()
            const streak = exportStreakSummary()
            const report = {
              title: '视力小训练营 · 给医生看的一页纸',
              exportedAt: new Date().toISOString(),
              summary: {
                sessions: summary.count,
                avgAccuracy: summary.avgAcc,
                totalMinutes: summary.totalMin,
                latestBci,
                latestFocus,
                bciNote: bciSentence(latestBci),
                focusNote: focusSentence(latestFocus),
                wallMsToday: liveWall,
                effectiveMsToday: liveEff,
                streakDays: streak.streak,
              },
              ability,
              streak,
              sessions: JSON.parse(json).sessions,
            }
            const blob = new Blob([JSON.stringify(report, null, 2)], {
              type: 'application/json',
            })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `vision-therapy-doctor-${new Date().toISOString().slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(url)
          }}
          className="min-h-12 rounded-2xl bg-emerald-500 px-5 py-3 text-base font-extrabold text-white"
        >
          导出给医生
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm('确定清空全部本地训练记录？')) return
            await clearTrainingSessions()
            await refresh()
          }}
          className="min-h-12 rounded-2xl bg-white px-5 py-3 text-base font-extrabold text-slate-600 ring-1 ring-slate-200"
        >
          清空记录
        </button>
      </div>

      <div className="mb-6 rounded-3xl bg-white/90 p-4 ring-1 ring-slate-200">
        <p className="text-base font-extrabold text-slate-700">更换 PIN</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pinSetup}
            onChange={(e) => setPinSetup(e.target.value)}
            className="min-h-12 rounded-2xl border border-slate-200 px-3 text-base font-bold"
            placeholder="新 PIN"
          />
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-indigo-500 px-4 text-base font-extrabold text-white"
            onClick={() => {
              try {
                setParentPin(pinSetup)
                setPinMsg('PIN 已保存')
                setPinSetup('')
              } catch (e) {
                setPinMsg(e instanceof Error ? e.message : '设置失败')
              }
            }}
          >
            保存
          </button>
          {hasParentPin() && (
            <button
              type="button"
              className="min-h-12 rounded-2xl bg-white px-4 text-base font-bold text-slate-600 ring-1 ring-slate-200"
              onClick={() => {
                clearParentPin()
                setPinMsg('已清除 PIN（下次进入需重新设置）')
              }}
            >
              清除
            </button>
          )}
        </div>
        {pinMsg && (
          <p className="mt-2 text-sm font-bold text-slate-600">{pinMsg}</p>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-2xl bg-rose-100 px-4 py-3 text-base font-bold text-rose-800">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-base font-bold text-slate-500">读取中…</p>
      ) : sessions.length === 0 ? (
        <div className="rounded-3xl bg-white/80 p-8 text-center ring-1 ring-sky-100">
          <p className="text-xl font-extrabold text-slate-700">还没有训练记录</p>
        </div>
      ) : (
        <>
          <ChartCard title="准确率 & 专注度">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="accuracy"
                name="准确率%"
                stroke="#f43f5e"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="focus"
                name="专注度"
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ChartCard>

          <ChartCard title="阈值对比度 & 分视 BCI">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" domain={[0, 1]} tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
              />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="contrast"
                name="末次对比度"
                stroke="#8b5cf6"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                connectNulls
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="bci"
                name="BCI"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ChartCard>

          <div className="overflow-x-auto rounded-3xl bg-white ring-1 ring-sky-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-extrabold text-slate-500">
                <tr>
                  <th className="px-4 py-3">时间</th>
                  <th className="px-4 py-3">模块</th>
                  <th className="px-4 py-3">准确率</th>
                  <th className="px-4 py-3">专注</th>
                  <th className="px-4 py-3">阈值/BCI</th>
                  <th className="px-4 py-3">得分</th>
                </tr>
              </thead>
              <tbody>
                {[...sessions].reverse().map((s) => (
                  <tr
                    key={s.id ?? s.startedAt}
                    className="border-t border-slate-100"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-700">
                      {formatShortDate(s.startedAt)}
                    </td>
                    <td className="px-4 py-3">{moduleLabel(s.module)}</td>
                    <td className="px-4 py-3 font-bold text-rose-600">
                      {s.accuracy.toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-amber-700">
                      {s.clinical?.focusAvg != null
                        ? s.clinical.focusAvg
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-violet-700">
                      {clinicalCell(s)}
                    </td>
                    <td className="px-4 py-3 font-bold">{s.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function ChartCard({
  title,
  children,
}: {
  title: string
  children: React.ReactElement
}) {
  return (
    <div className="mb-6 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-sky-100 sm:p-5">
      <p className="mb-3 text-left text-base font-extrabold text-slate-700">
        {title}
      </p>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/90 px-4 py-3 text-left shadow-sm ring-1 ring-sky-100">
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="text-2xl font-black text-slate-800">{value}</p>
    </div>
  )
}
