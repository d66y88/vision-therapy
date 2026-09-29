import { useEffect, useRef, useState } from 'react'
import { playTone } from '../lib/audio'

const BURST = ['⭐', '🎉', '✨', '🌟', '💫', '🎊']

/**
 * Non-blocking dose-target celebration: confetti + banner over the game,
 * pointer-events none so training continues uninterrupted.
 */
export function DoseCelebrateBanner({
  open,
  fullCheckIn,
  onDone,
}: {
  open: boolean
  /** True when playlist is also done → full daily check-in. */
  fullCheckIn: boolean
  onDone: () => void
}) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(0)

  useEffect(() => {
    if (!open) {
      setVisible(false)
      return
    }
    setVisible(true)
    playTone('cheer')
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setVisible(false)
      onDone()
    }, 3800)
    return () => window.clearTimeout(timerRef.current)
  }, [open, onDone])

  if (!visible) return null

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[65] flex items-start justify-center overflow-hidden pt-[max(4.5rem,12vh)]"
      aria-live="polite"
    >
      {/* Confetti rain */}
      {Array.from({ length: 28 }, (_, i) => {
        const left = (i * 37) % 100
        const delay = (i % 8) * 0.08
        const dur = 1.6 + (i % 5) * 0.25
        const emoji = BURST[i % BURST.length]!
        return (
          <span
            key={i}
            className="absolute text-2xl opacity-0 animate-[doseConfetti_2.4s_ease-out_forwards]"
            style={{
              left: `${left}%`,
              top: '-8%',
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
            }}
          >
            {emoji}
          </span>
        )
      })}

      <div className="mx-4 w-full max-w-md animate-[doseBannerIn_0.45s_ease-out] rounded-3xl bg-gradient-to-r from-amber-300 via-yellow-200 to-rose-200 px-5 py-4 text-center shadow-2xl ring-2 ring-white/80">
        <p className="text-3xl" aria-hidden>
          {fullCheckIn ? '🏆' : '⏱️'}
        </p>
        <p className="mt-1 text-2xl font-black text-amber-950">
          {fullCheckIn ? '今日打卡成功！' : '打卡时间攒够啦！'}
        </p>
        <p className="mt-1 text-base font-extrabold text-amber-900/80">
          {fullCheckIn
            ? '你太棒了，坚持训练真了不起～'
            : '继续把课表练完就能打卡，加油！'}
        </p>
      </div>

      <style>{`
        @keyframes doseConfetti {
          0% { transform: translateY(0) rotate(0deg) scale(0.6); opacity: 0; }
          12% { opacity: 1; }
          100% { transform: translateY(110vh) rotate(420deg) scale(1); opacity: 0; }
        }
        @keyframes doseBannerIn {
          0% { transform: translateY(-24px) scale(0.92); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
