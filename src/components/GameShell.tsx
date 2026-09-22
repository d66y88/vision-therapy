import type { ReactNode } from 'react'
import { useFullscreen } from '../hooks/useFullscreen'
import { GameShellProvider, useGameShell } from './GameShellContext'

interface GameShellProps {
  title: string
  subtitle?: string
  children: ReactNode
  toolbar?: ReactNode
}

/**
 * Training chrome with real viewport-filling fullscreen / immersive mode.
 */
export function GameShell({ title, subtitle, children, toolbar }: GameShellProps) {
  const { containerRef, isFullscreen, immersive, toggle, exit } = useFullscreen()

  return (
    <GameShellProvider isFullscreen={isFullscreen}>
      <div
        ref={containerRef}
        className={
          isFullscreen
            ? `flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-950 text-white ${
                immersive ? 'fixed inset-0 z-[70]' : ''
              }`
            : 'relative'
        }
      >
        <header
          className={
            isFullscreen
              ? 'flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-slate-900/95 px-3 py-2 safe-top'
              : 'mx-auto flex w-full max-w-4xl items-start justify-between gap-3 px-4 pt-4 sm:px-6'
          }
        >
          <div className="min-w-0 text-left">
            <h2
              className={
                isFullscreen
                  ? 'truncate text-base font-black text-white'
                  : 'truncate text-lg font-black text-slate-800 sm:text-xl'
              }
            >
              {title}
            </h2>
            {subtitle && !isFullscreen && (
              <p className="text-xs font-semibold text-slate-500 sm:text-sm">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {toolbar}
            <button
              type="button"
              onClick={() => void toggle()}
              className={
                isFullscreen
                  ? 'min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-slate-900'
                  : 'min-h-12 min-w-12 rounded-2xl bg-slate-800 px-4 py-2 text-sm font-extrabold text-white'
              }
            >
              {isFullscreen ? '退出全屏' : '全屏'}
            </button>
            {immersive && (
              <button
                type="button"
                onClick={() => void exit()}
                className="min-h-11 rounded-xl bg-white/15 px-3 py-2 text-sm font-extrabold text-white ring-1 ring-white/30"
              >
                关闭
              </button>
            )}
          </div>
        </header>

        <div
          className={
            isFullscreen
              ? 'flex min-h-0 flex-1 flex-col'
              : 'relative'
          }
        >
          {children}
        </div>
      </div>
    </GameShellProvider>
  )
}

/** Compact HUD row that sits above the stage in both modes. */
export function GameHud({ children }: { children: ReactNode }) {
  const { isFullscreen } = useGameShell()
  return (
    <div
      className={
        isFullscreen
          ? 'flex shrink-0 flex-wrap items-center gap-2 bg-slate-900 px-3 py-2'
          : 'mx-auto mb-3 grid w-full max-w-4xl grid-cols-2 gap-3 px-4 sm:grid-cols-3 sm:px-6'
      }
    >
      {children}
    </div>
  )
}

export function GameHudStat({
  label,
  value,
}: {
  label: string
  value: string
}) {
  const { isFullscreen } = useGameShell()
  if (isFullscreen) {
    return (
      <div className="rounded-lg bg-white/10 px-3 py-1.5 text-left">
        <p className="text-[10px] font-bold text-white/60">{label}</p>
        <p className="text-sm font-black text-white">{value}</p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl bg-white/90 px-3 py-2 text-left ring-1 ring-sky-100">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="text-xl font-black text-slate-800">{value}</p>
    </div>
  )
}

/** Bottom controls — docks over the stage edge in fullscreen. */
export function GameControls({ children }: { children: ReactNode }) {
  const { isFullscreen } = useGameShell()
  return (
    <div
      className={
        isFullscreen
          ? 'flex shrink-0 flex-wrap items-center gap-2 border-t border-white/10 bg-slate-900/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]'
          : 'mx-auto mt-4 flex w-full max-w-4xl flex-wrap gap-3 px-4 sm:px-6'
      }
    >
      {children}
    </div>
  )
}

export { useGameShell }
