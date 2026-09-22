import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Fullscreen + immersive fallback (important for iPad Safari).
 * Always reports layout mode so games can fill the viewport.
 */
export function useFullscreen() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [nativeFs, setNativeFs] = useState(false)
  const [immersive, setImmersive] = useState(false)

  useEffect(() => {
    const onChange = () => {
      const active = Boolean(document.fullscreenElement)
      setNativeFs(active)
      if (active) {
        setImmersive(false)
        document.body.style.overflow = 'hidden'
      } else if (!immersive) {
        document.body.style.overflow = ''
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.body.style.overflow = ''
    }
  }, [immersive])

  const enter = useCallback(async () => {
    const el = containerRef.current
    if (!el) return
    document.body.style.overflow = 'hidden'
    const ua = navigator.userAgent
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    if (isIOS) {
      setImmersive(true)
      return
    }
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen()
        return
      }
    } catch {
      /* fall through */
    }
    setImmersive(true)
  }, [])

  const exit = useCallback(async () => {
    setImmersive(false)
    document.body.style.overflow = ''
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen()
      } catch {
        /* ignore */
      }
    }
  }, [])

  const toggle = useCallback(async () => {
    if (nativeFs || immersive) await exit()
    else await enter()
  }, [nativeFs, immersive, enter, exit])

  return {
    containerRef,
    isFullscreen: nativeFs || immersive,
    immersive,
    toggle,
    enter,
    exit,
  }
}
