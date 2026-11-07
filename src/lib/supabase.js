import { createClient } from '@supabase/supabase-js'
import { createOfflineFetch } from './offline.mjs'

// ── Replace these with your actual Supabase project values ──────────────────
// You can find them at: https://supabase.com/dashboard → Project Settings → API
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://joilvslvsioayrjshuxg.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_aozkBamT5C58KY03X9kUgA_iehy73ZU'

const onlineClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: createOfflineFetch((...args) => fetch(...args)) },
  auth: { storageKey: 'ieces-portal-auth' },
})
// Cached reads must work even when the online access token has expired.
const offlineClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: createOfflineFetch((...args) => fetch(...args)) },
  accessToken: async () => 'offline',
})
export const supabase = new Proxy(onlineClient, {
  get(target, key) { return Reflect.get(navigator.onLine || key === 'auth' ? target : offlineClient, key) },
})

// ── Storage bucket name (create this in Supabase → Storage) ─────────────────
export const BUCKET = 'news-photos'

// ── Table name (run the SQL migration below to create it) ────────────────────
export const TABLE = 'news_articles'
