import { create } from 'zustand'

const STORAGE_KEY = 'vision_settings'

interface PersistedSettings {
  soundOn: boolean
}

interface SettingsState {
  soundOn: boolean
  setSoundOn: (on: boolean) => void
  /** Re-read from localStorage (after a cloud-sync pull). */
  rehydrate: () => void
}

function load(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return true
    const parsed = JSON.parse(raw) as PersistedSettings
    return parsed.soundOn !== false
  } catch {
    return true
  }
}

function persist(soundOn: boolean): void {
  const payload: PersistedSettings = { soundOn }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

/**
 * Lightweight app-wide settings (sound on/off), persisted to localStorage.
 * Read imperatively via useSettingsStore.getState() in non-React modules.
 */
export const useSettingsStore = create<SettingsState>((set) => ({
  soundOn: load(),
  setSoundOn: (on) => {
    persist(on)
    set({ soundOn: on })
  },
  rehydrate: () => set({ soundOn: load() }),
}))
