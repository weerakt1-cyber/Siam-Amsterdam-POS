import { NextRequest, NextResponse } from 'next/server'
import { supabase } from './supabase'
import { getSoleStoreId, resolveStoreRef } from './store'

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
  // 1. authenticated staff → their store (a session always wins over any hint)
  const profile = await getSessionProfile(req)
  if (profile?.store_id) return profile.store_id
  // 2. public/customer flows (QR order page) carry their store explicitly, since
  //    they have no session — as an `x-store-id` header or `?store=` (id or slug).
  //    An invalid hint returns null (400) rather than falling back to a guess.
  const hint = req.headers.get('x-store-id') || req.nextUrl.searchParams.get('store')
  if (hint) return await resolveStoreRef(hint)
  // 3. single-tenant convenience: the sole store, else null once ≥2 exist.
  return await getSoleStoreId()
}

/**
 * Resolve the store for a STAFF-only (tenant-scoped) route — orders list,
 * reports, members/users/inventory CRUD, etc. Unlike resolveStoreId(), this
 * NEVER trusts an unauthenticated store hint (`x-store-id` / `?store=`).
 *
 * Store slugs are public — they appear in the register/reserve QR links — so
 * honouring a hint here would let anyone with a slug read another tenant's
 * order history, daily cash reports, customer list, and so on. Callers must
 * 401 when this returns null.
 *
 * Rule (the sole-store fallback is allowed ONLY behind a valid session):
 *   • No valid session              → null   (caller returns 401)
 *   • Session with a store_id       → that store
 *   • Session, profile has no store → the sole store, else null once ≥2 exist
 *     (single-tenant convenience for an owner whose profile predates the
 *     multi-store column — still gated behind a real session)
 *
 * We deliberately do NOT expose the sole store to a hintless *unauthenticated*
 * request: on a single-store install (our first customer) that would leave
 * orders and cash reports readable with no auth at all — the very hole Task 1
 * closes. When in doubt, require the session.
 */
export async function resolveStaffStoreId(req: NextRequest): Promise<string | null> {
  const profile = await getSessionProfile(req)
  if (!profile) return null
  if (profile.store_id) return profile.store_id
  // Authenticated but unassigned → single-tenant fallback (null once ≥2 stores).
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

// Platform super-admin (operator) auth moved to @baze/db (requireSuperAdmin) with
// the /super-admin console + /api/admin routes in the separate apps/admin app.

// Every staff role — the app's four profile roles. Used to gate operational
// endpoints that need "a logged-in staff member" without caring which role.
export const STAFF_ROLES = ['admin', 'manager', 'bartender', 'staff']

/**
 * Guard for operational routes that just need an authenticated staff session
 * (any role) — e.g. printer/drawer control, AI, analytics, notification setup.
 * Thin wrapper over requireRole with the full role set; returns the same
 * `{ ok, profile } | { ok: false, res }` shape so callers `return gate.res`.
 */
export async function requireStaff(
  req: NextRequest,
): Promise<{ ok: true; profile: SessionProfile } | { ok: false; res: NextResponse }> {
  return requireRole(req, STAFF_ROLES)
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
