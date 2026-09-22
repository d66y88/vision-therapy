import { create } from 'zustand'
import {
  DEFAULT_COLOR_CONFIG,
  loadColorConfigFromStorage,
  saveColorConfigToStorage,
  type VisionColorConfig,
} from '../lib/colorConfig'

interface ColorConfigState extends VisionColorConfig {
  setRedR: (redR: number) => void
  setBlueG: (blueG: number) => void
  setBlueB: (blueB: number) => void
  /** Persist current values to Zustand snapshot + localStorage. */
  saveConfig: () => VisionColorConfig
  resetConfig: () => void
  hydrateFromStorage: () => void
}

export const useColorConfigStore = create<ColorConfigState>((set, get) => {
  const initial = loadColorConfigFromStorage()

  return {
    ...initial,
    setRedR: (redR) => set({ redR }),
    setBlueG: (blueG) => set({ blueG }),
    setBlueB: (blueB) => set({ blueB }),
    saveConfig: () => {
      const { redR, blueG, blueB } = get()
      const next: VisionColorConfig = {
        redR,
        blueG,
        blueB,
        updatedAt: new Date().toISOString(),
      }
      saveColorConfigToStorage(next)
      set(next)
      return next
    },
    resetConfig: () => {
      const next = {
        ...DEFAULT_COLOR_CONFIG,
        updatedAt: new Date().toISOString(),
      }
      saveColorConfigToStorage(next)
      set(next)
    },
    hydrateFromStorage: () => {
      set(loadColorConfigFromStorage())
    },
  }
})
