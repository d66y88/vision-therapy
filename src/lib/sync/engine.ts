/**
 * Local-first sync engine: pushes/pulls training sessions (append-only, keyed
 * by syncId) and whitelisted config KV (last-write-wins by updatedAt) to
 * Supabase. All operations are no-ops when sync isn't configured/linked.
 */
import { getSupabase } from '../supabaseClient'
import {
  getSessionBySyncId,
  insertRemoteSession,
  listTrainingSessions,
} from '../trainingDb'
import type { TrainingSession } from '../trainingTypes'
import { KV_META_KEY, SYNCED_KV_KEYS } from './kvKeys'

const LAST_PULL_KEY = 'vision_last_pull_at'

/** Current linked family id, set by syncStore after auth/bootstrap. */
let familyId: string | null = null
export function setSyncFamilyId(id: string | null): void {
  familyId = id
}
export function getSyncFamilyId(): string | null {
  return familyId
}

/** Clear the incremental pull cursor to force a full re-pull (e.g. on link). */
export function resetPullCursor(): void {
  localStorage.removeItem(LAST_PULL_KEY)
}

type KvMeta = Record<string, { value: string | null; updatedAt: string }>

function loadKvMeta(): KvMeta {
  try {
    const raw = localStorage.getItem(KV_META_KEY)
    return raw ? (JSON.parse(raw) as KvMeta) : {}
  } catch {
    return {}
  }
}
function saveKvMeta(meta: KvMeta): void {
  localStorage.setItem(KV_META_KEY, JSON.stringify(meta))
}

/** Serialize a training session to the DB row shape. */
function toRow(s: TrainingSession, family: string) {
  return {
    id: s.syncId,
    family_id: family,
    device_id: s.deviceId ?? null,
    module: s.module,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    duration_ms: Math.round(s.durationMs),
    accuracy: s.accuracy,
    avg_reaction_ms: s.avgReactionMs,
    score: s.score,
    clinical: s.clinical ?? null,
    updated_at: new Date().toISOString(),
  }
}

async function pushSessions(family: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const local = await listTrainingSessions()
  const rows = local
    .filter((s) => s.syncId)
    .map((s) => toRow(s, family))
  if (rows.length === 0) return
  // Idempotent upsert by primary key (syncId). Chunk to stay well within limits.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const { error } = await supabase
      .from('sessions')
      .upsert(chunk, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw error
  }
}

async function pullSessions(family: string): Promise<number> {
  const supabase = getSupabase()
  if (!supabase) return 0
  const since = localStorage.getItem(LAST_PULL_KEY) ?? '1970-01-01T00:00:00.000Z'
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('family_id', family)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
  if (error) throw error
  let added = 0
  let maxUpdated = since
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>
    const syncId = String(r.id)
    if (!(await getSessionBySyncId(syncId))) {
      const ok = await insertRemoteSession({
        syncId,
        deviceId: (r.device_id as string) ?? undefined,
        module: r.module as TrainingSession['module'],
        startedAt: r.started_at as string,
        endedAt: (r.ended_at as string) ?? (r.started_at as string),
        durationMs: Number(r.duration_ms ?? 0),
        accuracy: Number(r.accuracy ?? 0),
        avgReactionMs:
          r.avg_reaction_ms == null ? null : Number(r.avg_reaction_ms),
        score: Number(r.score ?? 0),
        clinical: (r.clinical as TrainingSession['clinical']) ?? undefined,
      })
      if (ok) added += 1
    }
    const u = String(r.updated_at)
    if (u > maxUpdated) maxUpdated = u
  }
  localStorage.setItem(LAST_PULL_KEY, maxUpdated)
  return added
}

async function pushKv(family: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const meta = loadKvMeta()
  const now = new Date().toISOString()
  const upserts: {
    family_id: string
    key: string
    value: unknown
    updated_at: string
  }[] = []
  for (const key of SYNCED_KV_KEYS) {
    const value = localStorage.getItem(key)
    const prev = meta[key]
    if (!prev || prev.value !== value) {
      const updatedAt = now
      meta[key] = { value, updatedAt }
      upserts.push({
        family_id: family,
        key,
        value: value == null ? null : JSON.parse(safeJson(value)),
        updated_at: updatedAt,
      })
    }
  }
  if (upserts.length > 0) {
    const { error } = await supabase
      .from('kv')
      .upsert(upserts, { onConflict: 'family_id,key' })
    if (error) throw error
    saveKvMeta(meta)
  }
}

/** Wrap raw string values as JSON so jsonb column accepts them uniformly. */
function safeJson(raw: string): string {
  try {
    JSON.parse(raw)
    return raw
  } catch {
    return JSON.stringify(raw)
  }
}

async function pullKv(family: string): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) return false
  const { data, error } = await supabase
    .from('kv')
    .select('key,value,updated_at')
    .eq('family_id', family)
  if (error) throw error
  const meta = loadKvMeta()
  let changed = false
  for (const row of data ?? []) {
    const r = row as { key: string; value: unknown; updated_at: string }
    if (!SYNCED_KV_KEYS.includes(r.key as never)) continue
    const local = meta[r.key]
    if (!local || r.updated_at > local.updatedAt) {
      const serialized =
        typeof r.value === 'string' ? r.value : JSON.stringify(r.value)
      const current = localStorage.getItem(r.key)
      if (current !== serialized) {
        localStorage.setItem(r.key, serialized)
        changed = true
      }
      meta[r.key] = { value: serialized, updatedAt: r.updated_at }
    }
  }
  saveKvMeta(meta)
  return changed
}

let running = false
let queued = false

/** Run a full sync cycle. Serialized; extra calls coalesce. */
export async function runSync(): Promise<{ kvChanged: boolean } | null> {
  const supabase = getSupabase()
  if (!supabase || !familyId) return null
  if (running) {
    queued = true
    return null
  }
  running = true
  try {
    await pushSessions(familyId)
    await pushKv(familyId)
    const added = await pullSessions(familyId)
    const kvChanged = await pullKv(familyId)
    const anyKv = kvChanged || added > 0
    if (kvChanged) {
      window.dispatchEvent(new Event('vision:kv-updated'))
    }
    return { kvChanged: anyKv }
  } finally {
    running = false
    if (queued) {
      queued = false
      void runSync()
    }
  }
}

let debounceTimer: number | null = null
/** Debounced, best-effort sync trigger (safe to call anywhere). */
export function requestSync(_reason?: string): void {
  if (!getSupabase() || !familyId) return
  if (debounceTimer != null) window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null
    void runSync().catch(() => {
      /* offline / transient — retried on next trigger */
    })
  }, 1200)
}
