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

// Returns the current Supabase access token (JWT), or null if not signed in.
// Used to authenticate calls to owner-only internal API routes.
export async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await getSupabaseBrowser().auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

// fetch() wrapper that attaches the Supabase access token as a Bearer header so
// the server can verify the caller's role on owner-only endpoints.
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
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

// Result of a profile read that DISTINGUISHES "no such row" (profile:null,
// error:false) from "the read failed" (error:true). This matters: a transient
// read failure (network blip, mid-flight token refresh, a brief 5xx/RLS hiccup)
// must NOT be mistaken for "this user has no account" — doing so bounced signed-in
// owners to the /auth/setup ("set up your account") screen at random during the
// day. Never route an authenticated user based on `error:true`.
export type ProfileResult = { profile: AppProfile | null; error: boolean }

export async function fetchProfileResult(userId: string): Promise<ProfileResult> {
  const sb = getSupabaseBrowser()
  const { data, error } = await sb
    .from('profiles')
    .select('id, name, role, requested_role, status, color, avatar_url, provider')
    .eq('id', userId)
    .maybeSingle()
  if (error) return { profile: null, error: true }
  return { profile: (data as AppProfile | null) ?? null, error: false }
}

// Same, but retries a few times on failure before giving up — smooths over the
// brief blips above so callers only see a definitive answer when one exists.
export async function fetchProfileRetry(userId: string, tries = 3): Promise<ProfileResult> {
  let last: ProfileResult = { profile: null, error: true }
  for (let i = 0; i < tries; i++) {
    last = await fetchProfileResult(userId)
    if (!last.error) return last
    await new Promise(r => setTimeout(r, 300 * (i + 1)))
  }
  return last
}

// Back-compat: returns the profile (or null) and collapses a read error to null.
// Prefer fetchProfileResult/fetchProfileRetry where the error must be handled.
export async function fetchProfile(userId: string): Promise<AppProfile | null> {
  return (await fetchProfileResult(userId)).profile
}

export const ROLE_HOME: Record<string, string> = {
  admin:     '/pos/analytics',
  manager:   '/pos/analytics',
  bartender: '/pos',
  staff:     '/pos',
}

// ─── Post-login provisioning ─────────────────────────────────────────────────
// Decide what to do with an authenticated user who has NO profile yet. A fresh
// signup stashes the store name/segment in user_metadata (survives the OAuth /
// email-confirm round-trip), so a store-intent signup is provisioned into its
// own store; anyone else (a plain login with no signup intent) falls through to
// the join/approval flow at /auth/setup. This is the single choke point shared
// by /signup, /auth, /auth/callback and the in-app guard so the decision is made
// the same way wherever the session first lands with no profile.
export type ProvisionOutcome =
  | { kind: 'provisioned'; slug: string | null; created: boolean; ownerPin?: string }
  | { kind: 'pending' }      // account awaiting approval (invite/join flow)
  | { kind: 'setup' }        // no store intent — send to /auth/setup
  | { kind: 'error'; message: string }

// Read the store name a signup stashed in user_metadata (any of a few key spellings).
export function storeIntentFromMetadata(meta: Record<string, unknown> | null | undefined): string {
  const m = meta ?? {}
  return String(m.storeName ?? m.store_name ?? '').trim()
}

// Attempt to provision the signed-in user's store from their signup metadata.
// Only call this once you already know the user has no profile row.
export async function provisionFromSession(): Promise<ProvisionOutcome> {
  const { data: { session } } = await getSupabaseBrowser().auth.getSession()
  if (!session) return { kind: 'setup' }
  const intent = storeIntentFromMetadata(session.user.user_metadata as Record<string, unknown>)
  if (!intent) return { kind: 'setup' }   // no store intent → join/approval flow
  try {
    const res = await authedFetch('/api/provision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
    const d = await res.json().catch(() => ({}))
    if (res.status === 409 && d.pending) return { kind: 'pending' }
    if (!res.ok) return { kind: 'error', message: d.error || 'provision failed' }
    return { kind: 'provisioned', slug: d.slug ?? null, created: !!d.created, ownerPin: d.ownerPin }
  } catch {
    return { kind: 'error', message: 'network' }
  }
}
