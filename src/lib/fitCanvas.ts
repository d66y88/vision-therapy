/**
 * Size a canvas to exactly fill its offset parent (the stage).
 * Returns CSS pixel dimensions used for gameplay math.
 */
export function fitCanvasToParent(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): { w: number; h: number } {
  const parent = canvas.parentElement
  const w = Math.max(1, parent?.clientWidth ?? canvas.clientWidth)
  const h = Math.max(1, parent?.clientHeight ?? canvas.clientHeight)
  const dpr = window.devicePixelRatio || 1
  const bw = Math.floor(w * dpr)
  const bh = Math.floor(h * dpr)
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw
    canvas.height = bh
  }
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { w, h }
}
