import { useCallback, useEffect, useRef } from 'react'
import { fitCanvasToParent } from '../lib/fitCanvas'

/**
 * Keeps a canvas pixel buffer matched to its CanvasStage parent.
 */
export function useStageCanvas(active = true) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef({ w: 640, h: 420 })

  const syncSize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return sizeRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return sizeRef.current
    sizeRef.current = fitCanvasToParent(canvas, ctx)
    return sizeRef.current
  }, [])

  useEffect(() => {
    if (!active) return
    syncSize()
  }, [active, syncSize])

  return { canvasRef, sizeRef, syncSize }
}
