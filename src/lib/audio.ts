/** Tiny Web Audio beeps — no external dependency. */

import { useSettingsStore } from '../store/settingsStore'

let sharedCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!AudioCtx) return null
  if (!sharedCtx) sharedCtx = new AudioCtx()
  return sharedCtx
}

/**
 * Play a short success / error / tick / balloon-pop / cheer tone.
 */
export function playTone(
  kind: 'success' | 'error' | 'tick' | 'pop' | 'cheer',
): void {
  if (!useSettingsStore.getState().soundOn) return
  const ctx = getCtx()
  if (!ctx) return

  void ctx.resume()
  const now = ctx.currentTime

  if (kind === 'cheer') {
    // Short ascending fanfare — clear but not long enough to feel like a cutscene.
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, now)
      const t0 = now + i * 0.09
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.3)
    })
    // Soft sparkle layer
    const sparkle = ctx.createOscillator()
    const sg = ctx.createGain()
    sparkle.type = 'sine'
    sparkle.frequency.setValueAtTime(1568, now + 0.28)
    sparkle.frequency.exponentialRampToValueAtTime(2093, now + 0.55)
    sg.gain.setValueAtTime(0.0001, now + 0.28)
    sg.gain.exponentialRampToValueAtTime(0.12, now + 0.32)
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.7)
    sparkle.connect(sg)
    sg.connect(ctx.destination)
    sparkle.start(now + 0.28)
    sparkle.stop(now + 0.72)
    return
  }

  if (kind === 'pop') {
    // Noise burst + falling pitch — satisfying balloon burst.
    const bufferSize = Math.floor(ctx.sampleRate * 0.12)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i += 1) {
      const t = i / bufferSize
      data[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t)
    }
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.0001, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.28, now + 0.008)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
    noise.connect(noiseGain)
    noiseGain.connect(ctx.destination)
    noise.start(now)
    noise.stop(now + 0.13)

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(420, now)
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.14)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.18)
    return
  }

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)

  if (kind === 'success') {
    osc.frequency.setValueAtTime(660, now)
    osc.frequency.exponentialRampToValueAtTime(990, now + 0.12)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
    osc.start(now)
    osc.stop(now + 0.24)
  } else if (kind === 'error') {
    osc.type = 'square'
    osc.frequency.setValueAtTime(180, now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
    osc.start(now)
    osc.stop(now + 0.2)
  } else {
    osc.frequency.setValueAtTime(440, now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
    osc.start(now)
    osc.stop(now + 0.1)
  }
}
