/**
 * Square-wave / checker backgrounds used in clinical vision-therapy UIs.
 * High-contrast bars give extra spatial-frequency drive while gameplay sits on top.
 */

export type GratingAxis = 'vertical' | 'horizontal'

export interface SquareGratingOptions {
  /** Width of one bar (half-cycle) in CSS pixels. Typical kid-friendly: 16–36. */
  barWidth: number
  colorA: string
  colorB: string
  axis: GratingAxis
  /** Phase shift in pixels (for slow drift animation). */
  phase?: number
  /** Overall opacity 0–1. */
  alpha?: number
}

export interface CheckerOptions {
  cell: number
  colorA: string
  colorB: string
  phaseX?: number
  phaseY?: number
  alpha?: number
}

/**
 * Fill a rectangle with a square-wave grating (hospital-style striped field).
 */
export function fillSquareGrating(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: SquareGratingOptions,
): void {
  const bar = Math.max(2, opts.barWidth)
  const phase = opts.phase ?? 0
  const alpha = opts.alpha ?? 1
  const prev = ctx.globalAlpha
  ctx.globalAlpha = alpha

  if (opts.axis === 'vertical') {
    const start = x - (((phase % (bar * 2)) + bar * 2) % (bar * 2))
    let i = 0
    for (let px = start; px < x + w; px += bar) {
      ctx.fillStyle = i % 2 === 0 ? opts.colorA : opts.colorB
      const left = Math.max(x, px)
      const right = Math.min(x + w, px + bar)
      if (right > left) ctx.fillRect(left, y, right - left, h)
      i += 1
    }
  } else {
    const start = y - (((phase % (bar * 2)) + bar * 2) % (bar * 2))
    let i = 0
    for (let py = start; py < y + h; py += bar) {
      ctx.fillStyle = i % 2 === 0 ? opts.colorA : opts.colorB
      const top = Math.max(y, py)
      const bottom = Math.min(y + h, py + bar)
      if (bottom > top) ctx.fillRect(x, top, w, bottom - top)
      i += 1
    }
  }

  ctx.globalAlpha = prev
}

/**
 * Classic black/white vertical grating (binocular fusion backdrop).
 */
export function fillBwVerticalGrating(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  barWidth = 24,
  phase = 0,
  alpha = 1,
): void {
  fillSquareGrating(ctx, 0, 0, w, h, {
    barWidth,
    colorA: '#111111',
    colorB: '#f5f5f5',
    axis: 'vertical',
    phase,
    alpha,
  })
}

/**
 * Dichoptic plaid: red vertical + blue horizontal bars over dark field.
 * Red-filter eye sees vertical structure more; blue-filter eye sees horizontal.
 */
export function fillDichopticPlaid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  redCss: string,
  blueCss: string,
  barWidth = 28,
  phase = 0,
): void {
  ctx.fillStyle = '#05070c'
  ctx.fillRect(0, 0, w, h)
  fillSquareGrating(ctx, 0, 0, w, h, {
    barWidth,
    colorA: redCss,
    colorB: '#05070c',
    axis: 'vertical',
    phase,
    alpha: 0.5,
  })
  fillSquareGrating(ctx, 0, 0, w, h, {
    barWidth,
    colorA: blueCss,
    colorB: '#05070c',
    axis: 'horizontal',
    phase: phase * 0.65,
    alpha: 0.4,
  })
}

/**
 * Checkerboard field (another common clinical pattern).
 */
export function fillCheckerboard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: CheckerOptions,
): void {
  const cell = Math.max(4, opts.cell)
  const alpha = opts.alpha ?? 1
  const prev = ctx.globalAlpha
  ctx.globalAlpha = alpha
  const ox = opts.phaseX ?? 0
  const oy = opts.phaseY ?? 0
  const cols = Math.ceil(w / cell) + 2
  const rows = Math.ceil(h / cell) + 2
  const x0 = -((ox % cell) + cell) % cell
  const y0 = -((oy % cell) + cell) % cell

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      ctx.fillStyle = (row + col) % 2 === 0 ? opts.colorA : opts.colorB
      ctx.fillRect(x0 + col * cell, y0 + row * cell, cell, cell)
    }
  }
  ctx.globalAlpha = prev
}
