import { useCallback, useEffect, useMemo, useState } from 'react'
import { toBlueCss, toRedCss } from '../lib/colorConfig'
import { useColorConfigStore } from '../store/colorConfigStore'

type FlashColor = 'red' | 'blue'

interface FlashPattern {
  color: FlashColor
  x: number
  y: number
  size: number
  shape: 'circle' | 'square' | 'diamond'
}

function createRandomPattern(color: FlashColor): FlashPattern {
  return {
    color,
    x: 10 + Math.random() * 80,
    y: 15 + Math.random() * 70,
    size: 48 + Math.random() * 96,
    shape: (['circle', 'square', 'diamond'] as const)[
      Math.floor(Math.random() * 3)
    ],
  }
}

function ChannelSlider({
  label,
  value,
  onChange,
  accentClass,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  accentClass: string
}) {
  return (
    <label className="block rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-sky-100">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-base font-bold text-slate-700">{label}</span>
        <span
          className={`min-w-14 rounded-xl px-3 py-1 text-center text-sm font-extrabold text-white ${accentClass}`}
        >
          {value}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={255}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-3 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-sky-500"
        aria-label={label}
      />
    </label>
  )
}

function FullscreenCalibrationTest({
  redCss,
  blueCss,
  onClose,
}: {
  redCss: string
  blueCss: string
  onClose: () => void
}) {
  const [pattern, setPattern] = useState<FlashPattern>(() =>
    createRandomPattern('red'),
  )
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const flashTimer = window.setInterval(() => {
      setVisible((v) => !v)
    }, 450)

    const swapTimer = window.setInterval(() => {
      setPattern((prev) =>
        createRandomPattern(prev.color === 'red' ? 'blue' : 'red'),
      )
      setVisible(true)
    }, 1800)

    return () => {
      window.clearInterval(flashTimer)
      window.clearInterval(swapTimer)
    }
  }, [])

  const fill = pattern.color === 'red' ? redCss : blueCss

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-start justify-between gap-4 p-4 sm:p-6">
        <div className="max-w-2xl text-left">
          <p className="text-lg font-extrabold sm:text-2xl">全屏滤镜测试</p>
          <p className="mt-2 text-sm text-white/80 sm:text-base">
            戴上红蓝眼镜：闭右眼看红色图案应几乎看不见；闭左眼看蓝色图案应几乎看不见。
            若仍能看见，请返回调滑块后再测。
          </p>
          <p className="mt-2 text-sm font-semibold text-amber-300">
            当前闪烁：{pattern.color === 'red' ? '红色（左眼通道）' : '蓝色（右眼通道）'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 min-w-12 rounded-2xl bg-white px-5 py-3 text-base font-extrabold text-slate-800 shadow-lg"
        >
          退出测试
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {visible && (
          <div
            className="absolute"
            style={{
              left: `${pattern.x}%`,
              top: `${pattern.y}%`,
              width: pattern.size,
              height: pattern.size,
              background: fill,
              transform:
                pattern.shape === 'diamond'
                  ? 'translate(-50%, -50%) rotate(45deg)'
                  : 'translate(-50%, -50%)',
              borderRadius: pattern.shape === 'circle' ? '9999px' : '12px',
              boxShadow: `0 0 40px ${fill}`,
            }}
          />
        )}
      </div>
    </div>
  )
}

export function ColorCalibration({ onSaved }: { onSaved?: () => void }) {
  const redR = useColorConfigStore((s) => s.redR)
  const blueG = useColorConfigStore((s) => s.blueG)
  const blueB = useColorConfigStore((s) => s.blueB)
  const setRedR = useColorConfigStore((s) => s.setRedR)
  const setBlueG = useColorConfigStore((s) => s.setBlueG)
  const setBlueB = useColorConfigStore((s) => s.setBlueB)
  const saveConfig = useColorConfigStore((s) => s.saveConfig)
  const resetConfig = useColorConfigStore((s) => s.resetConfig)

  const [savedHint, setSavedHint] = useState('')
  const [testing, setTesting] = useState(false)
  const [dirty, setDirty] = useState(false)

  const redCss = useMemo(() => toRedCss(redR), [redR])
  const blueCss = useMemo(() => toBlueCss(blueG, blueB), [blueG, blueB])

  const markDirty = useCallback(
    (setter: (v: number) => void) => (v: number) => {
      setter(v)
      setDirty(true)
    },
    [],
  )

  const handleSave = useCallback(() => {
    saveConfig()
    setDirty(false)
    setSavedHint('已保存到本机，训练游戏会自动使用这组颜色～')
    window.setTimeout(() => setSavedHint(''), 2800)
    onSaved?.()
  }, [saveConfig, onSaved])

  const handleReset = useCallback(() => {
    resetConfig()
    setDirty(false)
    setSavedHint('已恢复默认红蓝，并写回本机')
    window.setTimeout(() => setSavedHint(''), 2200)
  }, [resetConfig])

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-6 text-left">
        <p className="inline-flex rounded-full bg-amber-200/80 px-3 py-1 text-sm font-bold text-amber-900">
          模块一 · 红蓝眼镜校准
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-800 sm:text-4xl">
          调一调，让颜色「各管各的」
        </h1>
        <p className="mt-2 max-w-2xl text-base text-slate-600 sm:text-lg">
          戴上红蓝眼镜后：左眼（红镜）只应看见红色，右眼（蓝镜）只应看见蓝色。
          不同屏幕会有漏光，用下面的滑块调到闭一只眼时另一色几乎看不见即可。
        </p>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-rose-100">
          <div className="flex items-center justify-between bg-rose-50 px-4 py-3">
            <span className="font-extrabold text-rose-700">左眼 · 红镜</span>
            <span className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-rose-600">
              {redCss}
            </span>
          </div>
          <div
            className="flex h-40 items-center justify-center sm:h-48"
            style={{ background: redCss }}
          >
            <span className="rounded-2xl bg-black/35 px-4 py-2 text-lg font-black text-white backdrop-blur-sm">
              红块预览
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-cyan-100">
          <div className="flex items-center justify-between bg-cyan-50 px-4 py-3">
            <span className="font-extrabold text-cyan-700">右眼 · 蓝镜</span>
            <span className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-cyan-700">
              {blueCss}
            </span>
          </div>
          <div
            className="flex h-40 items-center justify-center sm:h-48"
            style={{ background: blueCss }}
          >
            <span className="rounded-2xl bg-black/35 px-4 py-2 text-lg font-black text-white backdrop-blur-sm">
              蓝块预览
            </span>
          </div>
        </div>
      </div>

      <div className="mb-6 overflow-hidden rounded-3xl bg-black p-4 shadow-md ring-1 ring-slate-700">
        <p className="mb-3 text-left text-sm font-extrabold text-white/80">
          黑底并排预览（更接近训练画面）
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div
            className="flex h-24 items-center justify-center rounded-2xl sm:h-28"
            style={{ background: redCss }}
          >
            <span className="text-sm font-black text-white/90">红 · 赛道/金币</span>
          </div>
          <div
            className="flex h-24 items-center justify-center rounded-2xl sm:h-28"
            style={{ background: blueCss }}
          >
            <span className="text-sm font-black text-white/90">蓝 · 角色/障碍</span>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4">
        <ChannelSlider
          label="Red Alpha（红色亮度 R）"
          value={redR}
          onChange={markDirty(setRedR)}
          accentClass="bg-rose-500"
        />
        <ChannelSlider
          label="Blue Green-Channel（蓝色 G）"
          value={blueG}
          onChange={markDirty(setBlueG)}
          accentClass="bg-emerald-500"
        />
        <ChannelSlider
          label="Blue Blue-Channel（蓝色 B）"
          value={blueB}
          onChange={markDirty(setBlueB)}
          accentClass="bg-sky-500"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="min-h-12 min-w-12 rounded-2xl bg-sky-500 px-6 py-3 text-base font-extrabold text-white shadow-md shadow-sky-200 transition hover:bg-sky-600 active:scale-[0.98]"
        >
          保存校准
        </button>
        <button
          type="button"
          onClick={() => setTesting(true)}
          className="min-h-12 min-w-12 rounded-2xl bg-amber-400 px-6 py-3 text-base font-extrabold text-amber-950 shadow-md shadow-amber-200 transition hover:bg-amber-300 active:scale-[0.98]"
        >
          全屏测试
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="min-h-12 min-w-12 rounded-2xl bg-white px-6 py-3 text-base font-extrabold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-[0.98]"
        >
          恢复默认
        </button>
        {dirty && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800">
            有未保存的修改
          </span>
        )}
      </div>

      {savedHint && (
        <p className="mt-4 rounded-2xl bg-emerald-100 px-4 py-3 text-left text-sm font-bold text-emerald-800">
          {savedHint}
        </p>
      )}

      <aside className="mt-6 rounded-3xl bg-white/70 p-4 text-left text-sm leading-relaxed text-slate-600 ring-1 ring-sky-100 sm:p-5">
        <p className="font-extrabold text-slate-800">小贴士</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>先闭右眼：红色块应清晰，蓝色块尽量看不见。</li>
          <li>再闭左眼：蓝色块应清晰，红色块尽量看不见。</li>
          <li>校准结果写入 Zustand 与 `localStorage.vision_color_config`。</li>
        </ul>
      </aside>

      {testing && (
        <FullscreenCalibrationTest
          redCss={redCss}
          blueCss={blueCss}
          onClose={() => setTesting(false)}
        />
      )}
    </section>
  )
}
