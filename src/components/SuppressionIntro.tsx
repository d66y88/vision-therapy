import { useState } from 'react'

/**
 * Short teaching gate before dichoptic games: show why both eyes / glasses matter.
 */
export function SuppressionIntro({ onPass }: { onPass: () => void }) {
  const [step, setStep] = useState(0)

  const steps = [
    {
      title: '为什么要戴红蓝眼镜？',
      body: '左边只给红色画面，右边只给蓝色画面。两只眼睛都要「上班」，弱视眼才不会偷懒。',
      demo: 'both' as const,
    },
    {
      title: '如果只看见红色…',
      body: '说明蓝眼睛（或蓝通道）被抑制了。正式训练里两边都会出现，要一起看。',
      demo: 'red' as const,
    },
    {
      title: '如果只看见蓝色…',
      body: '说明红眼睛被抑制了。戴上眼镜后，两边画面都会变得清楚。',
      demo: 'blue' as const,
    },
  ]

  const cur = steps[step]

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col px-4 py-8 sm:px-6">
      <p className="text-sm font-extrabold text-rose-700">抑制警报 · 教学关</p>
      <h1 className="mt-2 text-3xl font-black text-slate-800">{cur.title}</h1>
      <p className="mt-3 text-base leading-relaxed text-slate-600">{cur.body}</p>

      <div className="mt-6 flex h-40 items-center justify-center gap-6 rounded-3xl bg-slate-900 ring-1 ring-slate-700">
        {(cur.demo === 'both' || cur.demo === 'red') && (
          <div className="h-20 w-20 rounded-2xl bg-red-500 shadow-lg shadow-red-500/40" />
        )}
        {(cur.demo === 'both' || cur.demo === 'blue') && (
          <div className="h-20 w-20 rounded-2xl bg-cyan-400 shadow-lg shadow-cyan-400/40" />
        )}
        {cur.demo === 'red' && (
          <p className="text-sm font-bold text-white/70">蓝侧故意隐藏</p>
        )}
        {cur.demo === 'blue' && (
          <p className="text-sm font-bold text-white/70">红侧故意隐藏</p>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        {step < steps.length - 1 ? (
          <button
            type="button"
            className="min-h-12 flex-1 rounded-2xl bg-sky-500 px-4 py-3 text-sm font-extrabold text-white"
            onClick={() => setStep((s) => s + 1)}
          >
            下一页
          </button>
        ) : (
          <button
            type="button"
            className="min-h-12 flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-white"
            onClick={onPass}
          >
            我明白了，开始正式分视
          </button>
        )}
      </div>
    </div>
  )
}

const INTRO_KEY = 'vision_suppression_intro_done'

export function hasPassedSuppressionIntro(): boolean {
  return localStorage.getItem(INTRO_KEY) === '1'
}

export function markSuppressionIntroPassed(): void {
  localStorage.setItem(INTRO_KEY, '1')
}
