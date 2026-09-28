import { create } from 'zustand'
import { getSupabase, isSyncConfigured } from '../lib/supabaseClient'
import {
  resetPullCursor,
  runSync,
  setSyncFamilyId,
} from '../lib/sync/engine'
import { useColorConfigStore } from './colorConfigStore'
import { useSettingsStore } from './settingsStore'
import { useTherapyProfileStore } from './therapyProfileStore'

export type SyncStatus =
  | 'disabled' // sync not configured (no env) — local only
  | 'idle' // configured but not yet initialized
  | 'connecting'
  | 'ready'
  | 'error'

interface SyncState {
  status: SyncStatus
  familyId: string | null
  lastSyncedAt: string | null
  errorMessage: string | null
  /** Freshly generated sync code awaiting entry on another device. */
  pendingCode: string | null
  codeExpiresAt: string | null
  init: () => Promise<void>
  manualSync: () => Promise<void>
  generateCode: () => Promise<string | null>
  redeemCode: (code: string) => Promise<boolean>
  clearPendingCode: () => void
}

const FAMILY_ID_KEY = 'vision_family_id'
function loadFamilyId(): string | null {
  try {
    return localStorage.getItem(FAMILY_ID_KEY)
  } catch {
    return null
  }
}
function persistFamilyId(id: string): void {
  try {
    localStorage.setItem(FAMILY_ID_KEY, id)
  } catch {
    /* ignore */
  }
}

let kvListenerBound = false
function bindKvListener(): void {
  if (kvListenerBound) return
  kvListenerBound = true
  window.addEventListener('vision:kv-updated', () => {
    // Re-read cached stores from localStorage after a pull applied changes.
    useColorConfigStore.getState().hydrateFromStorage()
    useSettingsStore.getState().rehydrate()
    useTherapyProfileStore.getState().rehydrate()
  })
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: isSyncConfigured() ? 'idle' : 'disabled',
  familyId: null,
  lastSyncedAt: null,
  errorMessage: null,
  pendingCode: null,
  codeExpiresAt: null,

  init: async () => {
    const supabase = getSupabase()
    if (!supabase) {
      set({ status: 'disabled' })
      return
    }
    if (get().status === 'connecting') return
    set({ status: 'connecting', errorMessage: null })
    bindKvListener()
    try {
      // Ensure an anonymous session exists.
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) throw error
      }
      // Prefer a previously linked/redeemed family; else create/find one.
      let fam = loadFamilyId()
      if (!fam) {
        const { data: familyId, error: famErr } = await supabase.rpc(
          'create_family',
        )
        if (famErr) throw famErr
        fam = familyId as string
      }
      persistFamilyId(fam)
      setSyncFamilyId(fam)
      set({ familyId: fam })
      await runSync()
      set({ status: 'ready', lastSyncedAt: new Date().toISOString() })
    } catch (err) {
      set({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : '同步初始化失败',
      })
    }
  },

  manualSync: async () => {
    const supabase = getSupabase()
    if (!supabase || !get().familyId) return
    set({ status: 'connecting', errorMessage: null })
    try {
      await runSync()
      set({ status: 'ready', lastSyncedAt: new Date().toISOString() })
    } catch (err) {
      set({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : '同步失败',
      })
    }
  },

  generateCode: async () => {
    const supabase = getSupabase()
    if (!supabase || !get().familyId) return null
    try {
      const { data, error } = await supabase.rpc('create_sync_code')
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      const code = (row?.code ?? row) as string
      const expiresAt = (row?.expires_at ?? null) as string | null
      set({ pendingCode: code, codeExpiresAt: expiresAt })
      return code
    } catch (err) {
      set({
        errorMessage: err instanceof Error ? err.message : '生成同步码失败',
      })
      return null
    }
  },

  redeemCode: async (code: string) => {
    const supabase = getSupabase()
    if (!supabase) return false
    const clean = code.trim().toUpperCase()
    if (clean.length < 4) {
      set({ errorMessage: '同步码格式不正确' })
      return false
    }
    set({ status: 'connecting', errorMessage: null })
    try {
      // Make sure we're authenticated before redeeming.
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) throw error
      }
      const { data, error } = await supabase.rpc('redeem_sync_code', {
        p_code: clean,
      })
      if (error) throw error
      const fam = (Array.isArray(data) ? data[0] : data) as string
      if (!fam) throw new Error('同步码无效或已过期')
      persistFamilyId(fam)
      setSyncFamilyId(fam)
      resetPullCursor()
      set({ familyId: fam, pendingCode: null, codeExpiresAt: null })
      await runSync()
      set({ status: 'ready', lastSyncedAt: new Date().toISOString() })
      return true
    } catch (err) {
      set({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : '兑换同步码失败',
      })
      return false
    }
  },

  clearPendingCode: () => set({ pendingCode: null, codeExpiresAt: null }),
}))
