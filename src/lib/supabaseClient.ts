/**
 * Optional Supabase backend for cloud sync. Local-first: when env vars are
 * absent the client is null and the whole app keeps working purely offline.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client: SupabaseClient | null = null
if (url && anonKey) {
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // No email/OTP flows — anonymous sessions only.
      detectSessionInUrl: false,
    },
  })
}

/** The shared client, or null when sync is not configured. */
export function getSupabase(): SupabaseClient | null {
  return client
}

/** Whether cloud sync is available (env configured). */
export function isSyncConfigured(): boolean {
  return client != null
}
