import { create } from 'zustand'

export type AmblyopicEye = 'red' | 'blue'

const STORAGE_KEY = 'vision_therapy_profile'

interface PersistedProfile {
  amblyopicEye: AmblyopicEye
}

interface TherapyProfileState {
  amblyopicEye: AmblyopicEye
  setAmblyopicEye: (eye: AmblyopicEye) => void
  /** Re-read from localStorage (after a cloud-sync pull). */
  rehydrate: () => void
}

function load(): AmblyopicEye {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return 'red'
    const parsed = JSON.parse(raw) as PersistedProfile
    return parsed.amblyopicEye === 'blue' ? 'blue' : 'red'
  } catch {
    return 'red'
  }
}

function persist(eye: AmblyopicEye): void {
  const payload: PersistedProfile = { amblyopicEye: eye }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

/**
 * Shared therapy preferences (amblyopic eye) for dichoptic games.
 * Amblyopic channel = collect / must-see; fellow = distractor / opposite.
 */
export const useTherapyProfileStore = create<TherapyProfileState>((set) => ({
  amblyopicEye: load(),
  setAmblyopicEye: (eye) => {
    persist(eye)
    set({ amblyopicEye: eye })
  },
  rehydrate: () => set({ amblyopicEye: load() }),
}))
