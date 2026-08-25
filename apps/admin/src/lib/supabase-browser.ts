import { createClient, SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: SupabaseClient<any> | null = null

export function getSupabaseBrowser() {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
  if (url.includes('placeholder.supabase.co')) {
    console.error('[Supabase] NEXT_PUBLIC_SUPABASE_URL is not set — auth/DB calls will fail')
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _client = createClient<any>(url, key)
  return _client
}

// Current Supabase access token (JWT), or null if not signed in.
export async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await getSupabaseBrowser().auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

// fetch() that attaches the Supabase access token so the server can verify the
// caller (requireSuperAdmin) on the admin API routes.
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
