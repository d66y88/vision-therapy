/** Persisted dichoptic color calibration payload. */
export interface VisionColorConfig {
  /** Red channel intensity for left-eye-only stimuli: RGB(R, 0, 0). */
  redR: number
  /** Green channel for right-eye-only stimuli: RGB(0, G, B). */
  blueG: number
  /** Blue channel for right-eye-only stimuli: RGB(0, G, B). */
  blueB: number
  updatedAt: string
}

export const COLOR_CONFIG_STORAGE_KEY = 'vision_color_config'

export const DEFAULT_COLOR_CONFIG: VisionColorConfig = {
  redR: 255,
  blueG: 255,
  blueB: 255,
  updatedAt: new Date(0).toISOString(),
}

/**
 * Clamp a channel value into the valid 8-bit RGB range.
 */
export function clampChannel(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(255, Math.max(0, Math.round(value)))
}

/**
 * Build a pure red CSS color used for left-eye (red filter) stimuli.
 */
export function toRedCss(redR: number): string {
  return `rgb(${clampChannel(redR)}, 0, 0)`
}

/**
 * Build a pure cyan/blue CSS color used for right-eye (blue filter) stimuli.
 */
export function toBlueCss(blueG: number, blueB: number): string {
  return `rgb(0, ${clampChannel(blueG)}, ${clampChannel(blueB)})`
}

/**
 * Normalize and validate a partial config object.
 */
export function normalizeColorConfig(
  input: Partial<VisionColorConfig> | null | undefined,
): VisionColorConfig {
  return {
    redR: clampChannel(input?.redR ?? DEFAULT_COLOR_CONFIG.redR),
    blueG: clampChannel(input?.blueG ?? DEFAULT_COLOR_CONFIG.blueG),
    blueB: clampChannel(input?.blueB ?? DEFAULT_COLOR_CONFIG.blueB),
    updatedAt: input?.updatedAt ?? new Date().toISOString(),
  }
}

/**
 * Read calibration from localStorage. Returns defaults when missing/invalid.
 */
export function loadColorConfigFromStorage(): VisionColorConfig {
  try {
    const raw = localStorage.getItem(COLOR_CONFIG_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_COLOR_CONFIG }
    return normalizeColorConfig(JSON.parse(raw) as Partial<VisionColorConfig>)
  } catch {
    return { ...DEFAULT_COLOR_CONFIG }
  }
}

/**
 * Persist calibration to localStorage under the PRD key.
 */
export function saveColorConfigToStorage(config: VisionColorConfig): void {
  const normalized = normalizeColorConfig({
    ...config,
    updatedAt: new Date().toISOString(),
  })
  localStorage.setItem(COLOR_CONFIG_STORAGE_KEY, JSON.stringify(normalized))
}
