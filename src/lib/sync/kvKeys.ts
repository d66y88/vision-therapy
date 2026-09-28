/**
 * localStorage keys that participate in cross-device sync (last-write-wins).
 * Deliberately excludes device-local / ephemeral keys: the daily wall-clock
 * timer, one-time celebration flags, install-hint dismissal, device id, and
 * sync bookkeeping.
 */
export const SYNCED_KV_KEYS = [
  'vision_color_config',
  'vision_ability_profile',
  'vision_streak',
  'vision_rewards',
  'vision_playlist_progress',
  'vision_e_target_ms',
  'vision_wall_cap_ms',
  'vision_settings',
  'vision_therapy_profile',
  'vision_parent_pin',
] as const

export type SyncedKvKey = (typeof SYNCED_KV_KEYS)[number]

/** Meta store tracking per-key last-known value + updatedAt for LWW merges. */
export const KV_META_KEY = 'vision_kv_meta'
