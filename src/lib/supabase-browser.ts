import { createClient, SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: SupabaseClient<any> | null = null

export function getSupabaseBrowser() {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
  if (url.includes('placeholder.supabase.co')) {
    // NEXT_PUBLIC_SUPABASE_URL/ANON_KEY missing at build time — every auth/DB call
    // from the browser will fail. Set them in Vercel (Production scope) and trigger
    // a build that does NOT reuse the build cache, since NEXT_PUBLIC_ values are
    // inlined at build time and a cached chunk can keep serving the old value.
    console.error('[Supabase] NEXT_PUBLIC_SUPABASE_URL is not set — using placeholder, auth/DB calls will fail')
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _client = createClient<any>(url, key)
  return _client
}

export type AppProfile = {
  id:             string
  name:           string
  role:           'admin' | 'manager' | 'bartender' | 'staff' | null
  requested_role: 'admin' | 'manager' | 'bartender' | 'staff' | null
  status:         'pending' | 'approved' | 'rejected'
  color:          string
  avatar_url:     string | null
  provider:       string
}

export async function fetchProfile(userId: string): Promise<AppProfile | null> {
  const sb = getSupabaseBrowser()
  const { data } = await sb
    .from('profiles')
    .select('id, name, role, requested_role, status, color, avatar_url, provider')
    .eq('id', userId)
    .maybeSingle()
  return data as AppProfile | null
}

export const ROLE_HOME: Record<string, string> = {
  admin:     '/pos/analytics',
  manager:   '/pos/analytics',
  bartender: '/pos',
  staff:     '/pos',
}
