// @baze/db — shared store data layer: sole-store resolution, store lookups, and
// the subscription / billing / payments / AI-credit functions used by both the
// POS app (apps/pos) and the admin app (apps/admin). Extracted from
// apps/pos store.ts in monorepo M2. Runs on the service-role Supabase client.

import { supabase } from './supabase'
import { AI_ADDON, aiCostThb } from '@baze/config'

// The sole-store fallback: a single-tenant install has exactly one store, so
// callers (public customer order page, internal cross-calls during single-tenant
// operation) may omit it, and it falls back to the ONE existing store. As soon
// as a 2nd store is created this returns null and requireStoreId() throws —
// fail-safe: a forgotten filter can never silently serve another store's data.
let _soleStore: { id: string | null; at: number } | null = null
export async function getSoleStoreId(): Promise<string | null> {
  if (_soleStore && Date.now() - _soleStore.at < 30_000) return _soleStore.id
  const { data, error } = await supabase.from('stores').select('id').limit(2)
  const id = (!error && data && data.length === 1) ? (data[0].id as string) : null
  _soleStore = { id, at: Date.now() }
  return id
}

// Every store id — used by cron jobs that must run per-store (e.g. the daily
// reservation reminder).
export async function getAllStoreIds(): Promise<string[]> {
  const { data, error } = await supabase.from('stores').select('id')
  if (error || !data) return []
  return data.map(r => r.id as string)
}

export async function requireStoreId(storeId?: string): Promise<string> {
  const sid = storeId ?? (await getSoleStoreId())
  if (!sid) throw new Error('storeId is required (multiple stores exist — resolve the caller\'s store)')
  return sid
}

// Resolve a store reference (a uuid id, or a url slug) to a store id — used by
// the public QR order flow, which carries its store in the URL path. Returns
// null if it doesn't match any store (caller then 400s rather than guessing).
export async function resolveStoreRef(ref: string): Promise<string | null> {
  if (!ref) return null
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)
  const { data } = await supabase.from('stores').select('id').eq(isUuid ? 'id' : 'slug', ref).maybeSingle()
  return (data?.id as string) ?? null
}

export type StoreInfo = { id: string; name: string; slug: string | null }
export async function getStore(storeId: string): Promise<StoreInfo | null> {
  const { data } = await supabase.from('stores').select('id, name, slug').eq('id', storeId).maybeSingle()
  return data ? { id: data.id as string, name: data.name as string, slug: (data.slug as string | null) ?? null } : null
}

// Per-store subscription (Phase 0 — manual billing; see migration 019). Read-only
// here; the owner extends `subscription_until` by hand after collecting payment.
export type StoreSubscription = { plan: string; status: string; until: string | null; cycle: string | null; lockedPrice: number | null }
export async function getStoreSubscription(storeId?: string): Promise<StoreSubscription | null> {
  const sid = await requireStoreId(storeId)
  const { data } = await supabase
    .from('stores')
    .select('plan, subscription_status, subscription_until, billing_cycle, locked_price')
    .eq('id', sid)
    .maybeSingle()
  if (!data) return null
  return {
    plan:        (data.plan as string) ?? 'starter',
    status:      (data.subscription_status as string) ?? 'trial',
    until:       (data.subscription_until as string | null) ?? null,
    cycle:       (data.billing_cycle as string | null) ?? null,
    lockedPrice: data.locked_price != null ? Number(data.locked_price) : null,
  }
}

// ── Super-admin (cross-store) billing management (Phase 1) ───────────────────
// These operate across ALL stores and must only be reached behind
// requireSuperAdmin — they are intentionally NOT store-scoped.
export type StoreAdminRow = {
  id: string; name: string; slug: string | null
  plan: string; status: string; until: string | null
  cycle: string | null; lockedPrice: number | null
}

function mapStoreAdminRow(r: Record<string, unknown>): StoreAdminRow {
  return {
    id:          r.id as string,
    name:        r.name as string,
    slug:        (r.slug as string | null) ?? null,
    plan:        (r.plan as string) ?? 'starter',
    status:      (r.subscription_status as string) ?? 'trial',
    until:       (r.subscription_until as string | null) ?? null,
    cycle:       (r.billing_cycle as string | null) ?? null,
    lockedPrice: r.locked_price != null ? Number(r.locked_price) : null,
  }
}

const STORE_ADMIN_COLS = 'id, name, slug, plan, subscription_status, subscription_until, billing_cycle, locked_price'

export async function listStoresAdmin(): Promise<StoreAdminRow[]> {
  const { data, error } = await supabase.from('stores').select(STORE_ADMIN_COLS).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapStoreAdminRow)
}

export async function findStoreBySlug(slug: string): Promise<{ id: string } | null> {
  const { data } = await supabase.from('stores').select('id').eq('slug', slug).maybeSingle()
  return data ? { id: data.id as string } : null
}

export async function createStoreAdmin(input: {
  name: string; slug: string; plan?: string; cycle?: string | null; until?: string | null; lockedPrice?: number | null
}): Promise<StoreAdminRow> {
  const { data, error } = await supabase.from('stores').insert({
    name:                input.name,
    slug:                input.slug,
    plan:                input.plan ?? 'pro',
    subscription_status: input.until ? 'active' : 'trial',
    subscription_until:  input.until ?? null,
    billing_cycle:       input.cycle ?? null,
    locked_price:        input.lockedPrice ?? null,
  }).select(STORE_ADMIN_COLS).single()
  if (error) throw error
  return mapStoreAdminRow(data)
}

export async function updateStoreBilling(storeId: string, patch: {
  plan?: string; status?: string; until?: string | null; cycle?: string | null; lockedPrice?: number | null
}): Promise<StoreAdminRow | null> {
  const upd: Record<string, unknown> = {}
  if (patch.plan        !== undefined) upd.plan                = patch.plan
  if (patch.status      !== undefined) upd.subscription_status = patch.status
  if (patch.until       !== undefined) upd.subscription_until  = patch.until
  if (patch.cycle       !== undefined) upd.billing_cycle       = patch.cycle
  if (patch.lockedPrice !== undefined) upd.locked_price        = patch.lockedPrice
  const { data, error } = await supabase.from('stores').update(upd).eq('id', storeId).select(STORE_ADMIN_COLS).maybeSingle()
  if (error) throw error
  return data ? mapStoreAdminRow(data) : null
}

// ── Subscription payments ledger (Phase 1) ───────────────────────────────────
export type StorePayment = {
  id: string; storeId: string; kind: string; plan: string; cycle: string
  amount: number; months: number; status: string
  slipUrl: string | null; note: string | null
  createdAt: string; confirmedBy: string | null; confirmedAt: string | null
  storeName?: string; storeSlug?: string | null
}

function mapPayment(r: Record<string, unknown>): StorePayment {
  const store = r.stores as { name?: string; slug?: string | null } | null
  return {
    id:          r.id as string,
    storeId:     r.store_id as string,
    kind:        (r.kind as string) ?? 'subscription',
    plan:        r.plan as string,
    cycle:       r.cycle as string,
    amount:      Number(r.amount),
    months:      Number(r.months),
    status:      r.status as string,
    slipUrl:     (r.slip_url as string | null) ?? null,
    note:        (r.note as string | null) ?? null,
    createdAt:   r.created_at as string,
    confirmedBy: (r.confirmed_by as string | null) ?? null,
    confirmedAt: (r.confirmed_at as string | null) ?? null,
    storeName:   store?.name,
    storeSlug:   store?.slug ?? null,
  }
}

export async function hasConfirmedPayment(storeId: string): Promise<boolean> {
  const { count } = await supabase
    .from('store_payments').select('id', { count: 'exact', head: true })
    .eq('store_id', storeId).eq('status', 'confirmed')
  return (count ?? 0) > 0
}

export async function createStorePayment(input: {
  storeId: string; plan: string; cycle: string; amount: number; months: number; kind?: string
}): Promise<StorePayment> {
  const { data, error } = await supabase.from('store_payments').insert({
    store_id: input.storeId, plan: input.plan, cycle: input.cycle,
    amount: input.amount, months: input.months, status: 'pending',
    kind: input.kind ?? 'subscription',
  }).select('*').single()
  if (error) throw error
  return mapPayment(data)
}

export async function getStorePayment(id: string): Promise<StorePayment | null> {
  const { data } = await supabase.from('store_payments').select('*, stores(name, slug)').eq('id', id).maybeSingle()
  return data ? mapPayment(data) : null
}

export async function listStorePayments(storeId: string): Promise<StorePayment[]> {
  const { data, error } = await supabase.from('store_payments').select('*').eq('store_id', storeId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapPayment)
}

export async function listPaymentsAdmin(status?: string): Promise<StorePayment[]> {
  let q = supabase.from('store_payments').select('*, stores(name, slug)').order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(mapPayment)
}

export async function setPaymentSlip(id: string, storeId: string, slipPath: string): Promise<boolean> {
  const { data, error } = await supabase.from('store_payments')
    .update({ slip_url: slipPath }).eq('id', id).eq('store_id', storeId).select('id').maybeSingle()
  if (error) throw error
  return !!data
}

// Confirm a payment → extend the store's subscription by `months` (from the
// later of today or the current expiry, so no days are lost), mark it active,
// and lock in the base price for grandfathering if not already set.
export async function confirmStorePayment(id: string, by: string): Promise<StorePayment | null> {
  const payment = await getStorePayment(id)
  if (!payment || payment.status !== 'pending') return null

  if (payment.kind === 'ai') {
    // AI add-on subscription: monthly/yearly (cycle) starts/renews the credit.
    await activateAiSubscription(payment.storeId, payment.cycle === 'yearly' ? 'yearly' : 'monthly')
  } else if (payment.kind === 'ai_topup') {
    await addAiCredit(payment.storeId, payment.amount)
  } else {
    // Subscription renewal: extend from the later of today / current expiry.
    const sub = await getStoreSubscription(payment.storeId)
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
    const base = sub?.until && sub.until > today ? sub.until : today
    const d = new Date(base + 'T00:00:00Z')
    d.setUTCMonth(d.getUTCMonth() + payment.months)
    const newUntil = d.toISOString().slice(0, 10)

    // Lock the ongoing base price (not the promo amount) if not already locked.
    const cur = await supabase.from('stores').select('locked_price').eq('id', payment.storeId).maybeSingle()
    const lockedPrice = cur.data?.locked_price ?? null

    await updateStoreBilling(payment.storeId, {
      plan: payment.plan, status: 'active', until: newUntil, cycle: payment.cycle,
      lockedPrice: lockedPrice != null ? Number(lockedPrice) : undefined,
    })
  }

  const { data, error } = await supabase.from('store_payments')
    .update({ status: 'confirmed', confirmed_by: by, confirmed_at: new Date().toISOString() })
    .eq('id', id).select('*, stores(name, slug)').single()
  if (error) throw error
  return mapPayment(data)
}

export async function rejectStorePayment(id: string, by: string): Promise<StorePayment | null> {
  const { data, error } = await supabase.from('store_payments')
    .update({ status: 'rejected', confirmed_by: by, confirmed_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending').select('*, stores(name, slug)').maybeSingle()
  if (error) throw error
  return data ? mapPayment(data) : null
}

// ── Payment-slip storage (private bucket, auto-created on first use) ──────────
const SLIP_BUCKET = 'payment-slips'

export async function uploadPaymentSlip(storeId: string, paymentId: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const ext = contentType.includes('png') ? 'png' : contentType.includes('pdf') ? 'pdf' : 'jpg'
  const path = `${storeId}/${paymentId}.${ext}`
  const doUpload = () => supabase.storage.from(SLIP_BUCKET).upload(path, bytes, { contentType, upsert: true })
  let { error } = await doUpload()
  if (error && /bucket/i.test(error.message)) {
    await supabase.storage.createBucket(SLIP_BUCKET, { public: false }).catch(() => {})
    ;({ error } = await doUpload())
  }
  if (error) throw error
  return path
}

export async function signedSlipUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(SLIP_BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

// ── AI add-on credits (Phase 1.5) ────────────────────────────────────────────
export type AiCreditState = {
  status: string; balance: number; allowance: number
  resetDay: number | null; nextReset: string | null; until: string | null
}

const bkkToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
function addMonthsStr(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}
const AI_COLS = 'ai_status, ai_credit_balance, ai_monthly_allowance, ai_reset_day, ai_next_reset, ai_until'

// Apply any due monthly refreshes (yearly plans) up to today, capped at ai_until.
// No rollover: each reset overwrites the balance with the allowance.
export async function refreshAiCredit(storeId?: string): Promise<AiCreditState | null> {
  const sid = await requireStoreId(storeId)
  const { data: row } = await supabase.from('stores').select(AI_COLS).eq('id', sid).maybeSingle()
  if (!row) return null
  let balance = Number(row.ai_credit_balance ?? 0)
  let nextReset = (row.ai_next_reset as string | null) ?? null
  const until = (row.ai_until as string | null) ?? null
  const allowance = Number(row.ai_monthly_allowance ?? 0)
  const today = bkkToday()
  let changed = false
  if (row.ai_status !== 'none' && nextReset && until) {
    while (nextReset <= today && nextReset < until) {
      balance = allowance
      nextReset = addMonthsStr(nextReset, 1)
      changed = true
    }
  }
  if (changed) await supabase.from('stores').update({ ai_credit_balance: balance, ai_next_reset: nextReset }).eq('id', sid)
  return { status: row.ai_status as string, balance, allowance, resetDay: (row.ai_reset_day as number | null) ?? null, nextReset, until }
}

export async function checkAiAllowed(storeId?: string): Promise<{ allowed: boolean; reason?: string; state: AiCreditState | null }> {
  const state = await refreshAiCredit(storeId)
  if (!state || state.status === 'none') return { allowed: false, reason: 'no_subscription', state }
  if (state.until && state.until < bkkToday()) return { allowed: false, reason: 'expired', state }
  if (state.balance <= 0) return { allowed: false, reason: 'no_credit', state }
  return { allowed: true, state }
}

// Debit the real API cost after a call. The last call may push the balance
// slightly negative (we don't cut a call mid-flight); the next call is blocked.
export async function debitAiCredit(storeId: string, route: string, inputTokens: number, outputTokens: number): Promise<void> {
  const sid = await requireStoreId(storeId)
  const cost = aiCostThb(inputTokens, outputTokens)
  const { data: row } = await supabase.from('stores').select('ai_credit_balance').eq('id', sid).maybeSingle()
  const balance = Number(row?.ai_credit_balance ?? 0) - cost
  await supabase.from('stores').update({ ai_credit_balance: balance }).eq('id', sid)
  await supabase.from('ai_usage').insert({ store_id: sid, route, input_tokens: inputTokens, output_tokens: outputTokens, cost_thb: cost }).then(() => {}, () => {})
}

export async function activateAiSubscription(storeId: string, cycle: 'monthly' | 'yearly'): Promise<void> {
  const sid = await requireStoreId(storeId)
  const today = bkkToday()
  const allowance = AI_ADDON.monthlyCredit
  const until = addMonthsStr(today, cycle === 'yearly' ? 12 : 1)
  // Yearly refreshes monthly on the purchase day; monthly has no mid-cycle reset.
  const nextReset = cycle === 'yearly' ? addMonthsStr(today, 1) : until
  await supabase.from('stores').update({
    ai_status: cycle, ai_credit_balance: allowance, ai_monthly_allowance: allowance,
    ai_reset_day: Number(today.slice(8, 10)), ai_next_reset: nextReset, ai_until: until,
  }).eq('id', sid)
}

export async function addAiCredit(storeId: string, amount: number): Promise<void> {
  const sid = await requireStoreId(storeId)
  const { data: row } = await supabase.from('stores').select('ai_credit_balance').eq('id', sid).maybeSingle()
  await supabase.from('stores').update({ ai_credit_balance: Number(row?.ai_credit_balance ?? 0) + amount }).eq('id', sid)
}
