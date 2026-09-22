import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createFaceDetector,
  estimateDistanceCm,
  interEyePixelsFromDetection,
  isTooClose,
  MIN_DISTANCE_CM,
} from '../lib/distance'

type GuardStatus = 'off' | 'requesting' | 'watching' | 'unsupported' | 'denied'

/**
 * Optional distance guard. Uses Face Detection API when available;
 * otherwise shows a soft sitting-distance tip (no heavy ML deps).
 */
export function DistanceGuard({ enabled }: { enabled: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<GuardStatus>('off')
  const [distanceCm, setDistanceCm] = useState<number | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [tipOpen, setTipOpen] = useState(true)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStatus('off')
    setBlocked(false)
    setDistanceCm(null)
  }, [])

  const start = useCallback(async () => {
    if (!enabled) return
    const detector = createFaceDetector()
    if (!detector) {
      setStatus('unsupported')
      return
    }
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      video.srcObject = stream
      await video.play()
      setStatus('watching')

      const loop = async () => {
        if (!streamRef.current || !videoRef.current) return
        try {
          const faces = await detector.detect(videoRef.current)
          if (faces[0]) {
            const eyePx = interEyePixelsFromDetection(faces[0])
            const dist = estimateDistanceCm(eyePx ?? 0, videoRef.current.videoWidth || 640)
            setDistanceCm(dist)
            setBlocked(isTooClose(dist))
          }
        } catch {
          // ignore intermittent detect errors
        }
        if (streamRef.current) {
          window.setTimeout(() => {
            void loop()
          }, 700)
        }
      }
      void loop()
    } catch {
      setStatus('denied')
    }
  }, [enabled])

  useEffect(() => {
    return () => stop()
  }, [stop])

  if (!enabled) return null

  return (
    <>
      <video ref={videoRef} className="pointer-events-none fixed h-0 w-0 opacity-0" muted playsInline />

      <div className="rounded-2xl bg-white/90 px-3 py-2 text-left shadow-sm ring-1 ring-sky-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold text-slate-500">坐姿距离护眼</p>
            <p className="text-xs font-semibold text-slate-700">
              建议 ≥ {MIN_DISTANCE_CM}cm
              {distanceCm != null && status === 'watching'
                ? ` · 约 ${distanceCm.toFixed(0)}cm`
                : ''}
            </p>
          </div>
          {status === 'watching' || status === 'requesting' ? (
            <button
              type="button"
              className="min-h-10 rounded-xl bg-slate-100 px-3 text-xs font-extrabold text-slate-600"
              onClick={stop}
            >
              关闭摄像头
            </button>
          ) : (
            <button
              type="button"
              className="min-h-10 rounded-xl bg-amber-400 px-3 text-xs font-extrabold text-amber-950"
              onClick={() => void start()}
            >
              {status === 'denied'
                ? '重试摄像头'
                : status === 'unsupported'
                  ? '本机不支持检测'
                  : '开启监测'}
            </button>
          )}
        </div>
        {(status === 'unsupported' || status === 'denied') && tipOpen && (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            当前浏览器无法自动测距。请让孩子眼睛离屏幕大约一臂远（≥{MIN_DISTANCE_CM}cm）。
            <button
              type="button"
              className="ml-2 font-bold text-sky-600"
              onClick={() => setTipOpen(false)}
            >
              知道了
            </button>
          </p>
        )}
      </div>

      {blocked && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-rose-950/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
            <p className="text-sm font-extrabold text-rose-600">靠太近啦</p>
            <h2 className="mt-2 text-2xl font-black text-slate-800">
              请保持距离，保护眼睛哦！
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              估测约 {distanceCm?.toFixed(0) ?? '—'}cm，请后退到 {MIN_DISTANCE_CM}cm
              以外。回到安全距离后会自动解除。
            </p>
            <button
              type="button"
              className="mt-5 min-h-12 rounded-2xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-500"
              onClick={() => setBlocked(false)}
            >
              暂时关闭本次提示
            </button>
          </div>
        </div>
      )}
    </>
  )
}
