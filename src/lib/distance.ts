/**
 * Lightweight screen-distance heuristic using the optional Face Detection API.
 * Falls back to a gentle reminder when the API / camera is unavailable.
 */

export const MIN_DISTANCE_CM = 40

/** Typical adult IPD used only as a coarse scale reference (mm). */
const REF_IPD_MM = 63

/**
 * Estimate viewing distance (cm) from inter-eye pixel gap and camera FOV.
 * Rough pinhole model — good enough for a "too close" soft lock, not clinical.
 */
export function estimateDistanceCm(
  interEyePx: number,
  frameWidthPx: number,
  horizontalFovDeg = 65,
): number | null {
  if (interEyePx <= 1 || frameWidthPx <= 1) return null
  const fovRad = (horizontalFovDeg * Math.PI) / 180
  const focalPx = frameWidthPx / (2 * Math.tan(fovRad / 2))
  const distanceMm = (REF_IPD_MM * focalPx) / interEyePx
  return distanceMm / 10
}

/**
 * True when estimated distance is below the safety threshold.
 */
export function isTooClose(distanceCm: number | null): boolean {
  if (distanceCm == null) return false
  return distanceCm < MIN_DISTANCE_CM
}

export interface FaceDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<
    Array<{
      landmarks?: Array<{ type?: string; locations?: Array<{ x: number; y: number }> }>
      boundingBox?: { x: number; y: number; width: number; height: number }
    }>
  >
}

/**
 * Create a browser FaceDetector when supported.
 */
export function createFaceDetector(): FaceDetectorLike | null {
  const w = window as unknown as {
    FaceDetector?: new (opts?: {
      fastMode?: boolean
      maxDetectedFaces?: number
    }) => FaceDetectorLike
  }
  if (typeof w.FaceDetector !== 'function') return null
  try {
    return new w.FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
  } catch {
    return null
  }
}

/**
 * Extract eye-center distance in pixels from a FaceDetector result.
 */
export function interEyePixelsFromDetection(
  detection: {
    landmarks?: Array<{
      type?: string
      locations?: Array<{ x: number; y: number }>
    }>
    boundingBox?: { width: number }
  },
): number | null {
  const eyes = detection.landmarks?.filter(
    (l) => l.type === 'eye' && l.locations && l.locations.length > 0,
  )
  if (eyes && eyes.length >= 2 && eyes[0].locations && eyes[1].locations) {
    const a = eyes[0].locations[0]
    const b = eyes[1].locations[0]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  // Fallback: face box width is correlated with proximity.
  if (detection.boundingBox && detection.boundingBox.width > 0) {
    return detection.boundingBox.width * 0.35
  }
  return null
}
