/** Pure helpers for the dichoptic anti-suppression scroller. */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Vec2 {
  x: number
  y: number
}

/**
 * Axis-aligned bounding-box overlap test.
 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  )
}

/**
 * Clamp player vertical position inside the playfield (excluding fusion frame).
 */
export function clampPlayerY(
  y: number,
  playerH: number,
  fieldTop: number,
  fieldBottom: number,
): number {
  return Math.min(fieldBottom - playerH, Math.max(fieldTop, y))
}

/**
 * Convert a swipe delta into a discrete vertical intent.
 * Positive dy (finger down) → move down; negative → move up.
 */
export function swipeToVerticalIntent(
  dx: number,
  dy: number,
  threshold = 28,
): -1 | 0 | 1 {
  if (Math.abs(dy) < threshold && Math.abs(dx) < threshold) return 0
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy > 0 ? 1 : -1
  }
  // Horizontal swipes nudge forward feel but we only control Y — ignore.
  return 0
}
