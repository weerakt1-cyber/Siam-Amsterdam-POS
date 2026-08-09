import { NextRequest, NextResponse } from 'next/server'
import { supabase } from './supabase'
import { getSoleStoreId } from './store'

// ─── Session role guard (for owner/manager-only endpoints) ────────────────────
// The browser Supabase session lives in localStorage, so callers must send their
// access token as `Authorization: Bearer <token>`. We verify the JWT server-side
// and look up the caller's role in `profiles` — the tamper-proof source of truth
// (the PIN staff-switcher role is client-only and cannot be trusted here).

export type SessionProfile = { id: string; role: string; name: string; store_id: string | null }

export async function getSessionProfile(req: NextRequest): Promise<SessionProfile | null> {
  const authz = req.headers.get('authorization') ?? ''
  const token = authz.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : ''
  if (!token) return null

  const { data: userData, error } = await supabase.auth.getUser(token)
  if (error || !userData?.user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, role, store_id')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (!profile?.role) return null
  return {
    id:       profile.id as string,
    role:     profile.role as string,
    name:     profile.name as string,
    store_id: (profile.store_id as string | null) ?? null,
  }
}

/**
 * Resolve which store a request belongs to, for tenant-scoped queries:
 *   1. an authenticated staff session → that user's store, else
 *   2. the sole existing store (single-tenant convenience for public/customer
 *      and internal flows). Returns null once a 2nd store exists and the caller
 *      isn't authenticated — callers must then treat it as a 400/401.
 */
export async function resolveStoreId(req: NextRequest): Promise<string | null> {
  const profile = await getSessionProfile(req)
  if (profile?.store_id) return profile.store_id
  return await getSoleStoreId()
}

/**
 * Guard for API routes. Returns `{ ok: true, profile }` when the caller's role
 * is in `allowed`, otherwise `{ ok: false, res }` with a 401/403 to return.
 *
 *   const auth = await requireRole(req, ['admin'])
 *   if (!auth.ok) return auth.res
 */
export async function requireRole(
  req: NextRequest,
  allowed: string[],
): Promise<{ ok: true; profile: SessionProfile } | { ok: false; res: NextResponse }> {
  const profile = await getSessionProfile(req)
  if (!profile) {
    return { ok: false, res: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  if (!allowed.includes(profile.role)) {
    return { ok: false, res: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }) }
  }
  return { ok: true, profile }
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input)
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export type ApiKeyRecord = {
  id: string
  label: string
  active: boolean
  store_id: string | null
}

/**
 * Validates the X-API-Key header against hashed keys in the api_keys table.
 * Returns the key record if valid, null if missing/invalid/inactive.
 */
export async function validateApiKey(req: NextRequest): Promise<ApiKeyRecord | null> {
  const raw = req.headers.get('x-api-key')
  if (!raw) return null

  const hash = await sha256Hex(raw)

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, label, active, store_id')
    .eq('key_hash', hash)
    .eq('active', true)
    .single()

  if (error || !data) return null
  return data as ApiKeyRecord
}

/**
 * Generates a new API key, stores its hash in Supabase, returns the raw key.
 * The raw key is shown once — never stored.
 */
export async function generateApiKey(label: string): Promise<{ raw: string; id: string }> {
  const raw  = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const hash = await sha256Hex(raw)
  const id   = crypto.randomUUID()

  const { error } = await supabase.from('api_keys').insert({
    id,
    label,
    key_hash:   hash,
    active:     true,
    created_at: new Date().toISOString(),
  })
  if (error) throw error

  return { raw, id }
}

export async function listApiKeys(): Promise<{ id: string; label: string; active: boolean; createdAt: string }[]> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, label, active, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(r => ({
    id:        r.id,
    label:     r.label,
    active:    r.active,
    createdAt: r.created_at,
  }))
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await supabase
    .from('api_keys')
    .update({ active: false })
    .eq('id', id)
  if (error) throw error
}
