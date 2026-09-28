import { useEffect, useState } from 'react'

const DISMISS_KEY = 'vision_install_hint_dismissed'

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  // Exclude in-app browsers where add-to-home isn't available.
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  return isIos && isSafari
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (
    window.navigator as unknown as { standalone?: boolean }
  ).standalone
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    iosStandalone === true
  )
}

/**
 * iOS Safari has no beforeinstallprompt — nudge parents to Add to Home Screen
 * so data survives Safari's 7-day storage eviction and runs full-screen.
 */
export function InstallHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === '1') return
    if (isIosSafari() && !isStandalone()) setShow(true)
  }, [])

  if (!show) return null

  return (
    <div className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-md rounded-2xl bg-white/95 p-4 shadow-xl ring-1 ring-sky-200 backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="text-2xl">📲</span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold text-slate-800">
            装到主屏更好用
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            点底部「分享」按钮 → 选「添加到主屏幕」，即可全屏训练，且训练记录不会被系统清除。
          </p>
        </div>
        <button
          type="button"
          aria-label="关闭提示"
          className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-500"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1')
            setShow(false)
          }}
        >
          知道了
        </button>
      </div>
    </div>
  )
}
