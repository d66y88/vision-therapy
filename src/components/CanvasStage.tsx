import { useEffect, useRef, type ReactNode } from 'react'
import { useGameShell } from './GameShellContext'

interface CanvasStageProps {
  children: ReactNode
  className?: string
  /** Fires after the stage box changes size (fullscreen / rotate / resize). */
  onResize?: (size: { w: number; h: number }) => void
}

/**
 * Playfield that fills available height in fullscreen, or a tall panel in page mode.
 * onResize is stored in a ref so parent re-renders do not re-bind ResizeObserver.
 */
export function CanvasStage({ children, className = '', onResize }: CanvasStageProps) {
  const { isFullscreen } = useGameShell()
  const ref = useRef<HTMLDivElement>(null)
  const onResizeRef = useRef(onResize)
  onResizeRef.current = onResize
  const lastSizeRef = useRef({ w: 0, h: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const notify = () => {
      const next = { w: el.clientWidth, h: el.clientHeight }
      if (next.w === lastSizeRef.current.w && next.h === lastSizeRef.current.h) {
        return
      }
      lastSizeRef.current = next
      onResizeRef.current?.(next)
    }

    notify()
    const ro = new ResizeObserver(() => notify())
    ro.observe(el)
    window.addEventListener('resize', notify)
    document.addEventListener('fullscreenchange', notify)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', notify)
      document.removeEventListener('fullscreenchange', notify)
    }
  }, [isFullscreen])

  return (
    <div
      ref={ref}
      data-canvas-stage
      className={
        isFullscreen
          ? `relative min-h-0 w-full flex-1 overflow-hidden ${className}`
          : `relative h-[min(56vh,560px)] min-h-[360px] w-full overflow-hidden rounded-3xl ${className}`
      }
    >
      {children}
    </div>
  )
}
