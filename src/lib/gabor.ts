/**
 * Pure Gabor patch math helpers for Canvas rendering.
 */

export interface GaborParams {
  /** Spatial period λ in pixels (derived from spatialFrequency). */
  lambda: number
  /** Orientation θ in radians. */
  theta: number
  /** Phase ψ in radians. */
  psi: number
  /** Gaussian envelope σ in pixels. */
  sigma: number
  /** Aspect ratio γ. */
  gamma: number
  /** Michelson-like contrast in [0, 1]. */
  contrast: number
}

export interface GaborStimulusState {
  /** Cycles per pixel, range ~0.01–0.2. */
  spatialFrequency: number
  /** Contrast 0.05–1.0. */
  contrast: number
  /** Degrees 0–180. */
  orientationDeg: number
  /** Gaussian window size. */
  sigma: number
}

export const GABOR_LIMITS = {
  spatialFrequency: { min: 0.02, max: 0.1 },
  contrast: { min: 0.2, max: 1.0 },
  sigma: { min: 14, max: 28 },
  /** Generous search window for kids (was still too short in practice). */
  responseMs: 12000,
  /** Calm pause between trials. */
  interTrialMs: 1800,
  /** Expand clickable area beyond the drawn patch. */
  hitPaddingPx: 12,
} as const

/**
 * Clamp a number into [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Convert stimulus controls into Gabor formula parameters.
 */
export function toGaborParams(state: GaborStimulusState): GaborParams {
  const sf = clamp(
    state.spatialFrequency,
    GABOR_LIMITS.spatialFrequency.min,
    GABOR_LIMITS.spatialFrequency.max,
  )
  return {
    lambda: 1 / sf,
    theta: (state.orientationDeg * Math.PI) / 180,
    psi: 0,
    sigma: clamp(state.sigma, GABOR_LIMITS.sigma.min, GABOR_LIMITS.sigma.max),
    gamma: 1,
    contrast: clamp(
      state.contrast,
      GABOR_LIMITS.contrast.min,
      GABOR_LIMITS.contrast.max,
    ),
  }
}

/**
 * Evaluate a single Gabor sample at local pixel (x, y) relative to patch center.
 * Returns grayscale intensity in [-contrast, +contrast] around mid-gray.
 */
export function evaluateGabor(
  x: number,
  y: number,
  params: GaborParams,
): number {
  const cosT = Math.cos(params.theta)
  const sinT = Math.sin(params.theta)
  const xPrime = x * cosT + y * sinT
  const yPrime = -x * sinT + y * cosT
  const envelope = Math.exp(
    -(xPrime * xPrime + params.gamma * params.gamma * yPrime * yPrime) /
      (2 * params.sigma * params.sigma),
  )
  const carrier = Math.cos((2 * Math.PI * xPrime) / params.lambda + params.psi)
  return envelope * carrier * params.contrast
}

/**
 * Rasterize a square Gabor patch into ImageData (grayscale on mid-gray 128).
 */
export function renderGaborImageData(
  size: number,
  state: GaborStimulusState,
): ImageData {
  const params = toGaborParams(state)
  const data = new Uint8ClampedArray(size * size * 4)
  const half = (size - 1) / 2

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const v = evaluateGabor(px - half, py - half, params)
      const gray = Math.round(128 + v * 127)
      const i = (py * size + px) * 4
      data[i] = gray
      data[i + 1] = gray
      data[i + 2] = gray
      data[i + 3] = 255
    }
  }

  return new ImageData(data, size, size)
}

/**
 * Fill luminance noise into an ImageData buffer (every pixel is a B/W speck).
 * `contrast` 0–1 controls how far from mid-gray (higher = clearer dots).
 */
export function fillNoiseImageData(
  imageData: ImageData,
  contrast = 0.55,
): void {
  const { data } = imageData
  const amp = Math.min(1, Math.max(0.1, contrast)) * 127
  for (let i = 0; i < data.length; i += 4) {
    const n = Math.round(128 + (Math.random() * 2 - 1) * amp)
    const v = Math.min(255, Math.max(0, n))
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
    data[i + 3] = 255
  }
}
