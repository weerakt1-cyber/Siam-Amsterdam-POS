// @baze/db — affiliate / commission data layer (M3a). Operator-managed for now
// (via /super-admin); the future affiliate portal reads the same tables.
import { supabase } from './supabase'

export type Affiliate = {
  id: string; name: string; contact: string | null; email: string | null
  referralCode: string; commissionRate: number
  status: string; payoutInfo: string | null; note: string | null; createdAt: string
}

function mapAffiliate(r: Record<string, unknown>): Affiliate {
  return {
    id:             r.id as string,
    name:           r.name as string,
    contact:        (r.contact as string | null) ?? null,
    email:          (r.email as string | null) ?? null,
    referralCode:   r.referral_code as string,
    commissionRate: Number(r.commission_rate),
    status:         (r.status as string) ?? 'active',
    payoutInfo:     (r.payout_info as string | null) ?? null,
    note:           (r.note as string | null) ?? null,
    createdAt:      r.created_at as string,
  }
}

const AFF_COLS = 'id, name, contact, email, referral_code, commission_rate, status, payout_info, note, created_at'

export async function listAffiliates(): Promise<Affiliate[]> {
  const { data, error } = await supabase.from('affiliates').select(AFF_COLS).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapAffiliate)
}

export async function getAffiliateByCode(code: string): Promise<Affiliate | null> {
  const { data } = await supabase.from('affiliates').select(AFF_COLS).eq('referral_code', code).maybeSingle()
  return data ? mapAffiliate(data) : null
}

// Map a login email → affiliate (portal auth). Email is stored lowercased.
export async function getAffiliateByEmail(email: string): Promise<Affiliate | null> {
  const { data } = await supabase.from('affiliates').select(AFF_COLS).eq('email', email.toLowerCase()).maybeSingle()
  return data ? mapAffiliate(data) : null
}

// Generate a short unique-ish referral code from the name + a random suffix.
function makeCode(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'REF'
  const suffix = Math.abs(Array.from(name).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, Date.now() & 0xffff)).toString(36).slice(0, 4).toUpperCase()
  return `${base}${suffix}`
}

export async function createAffiliate(input: {
  name: string; contact?: string | null; email?: string | null; commissionRate?: number; payoutInfo?: string | null; note?: string | null; referralCode?: string
}): Promise<Affiliate> {
  const code = (input.referralCode && input.referralCode.trim()) || makeCode(input.name)
  const { data, error } = await supabase.from('affiliates').insert({
    name:            input.name,
    contact:         input.contact ?? null,
    email:           input.email ? input.email.trim().toLowerCase() : null,
    referral_code:   code,
    commission_rate: input.commissionRate ?? 0.20,
    payout_info:     input.payoutInfo ?? null,
    note:            input.note ?? null,
  }).select(AFF_COLS).single()
  if (error) throw error
  return mapAffiliate(data)
}

export async function updateAffiliate(id: string, patch: {
  name?: string; contact?: string | null; email?: string | null; commissionRate?: number; status?: string; payoutInfo?: string | null; note?: string | null
}): Promise<Affiliate | null> {
  const upd: Record<string, unknown> = {}
  if (patch.name           !== undefined) upd.name            = patch.name
  if (patch.contact        !== undefined) upd.contact         = patch.contact
  if (patch.email          !== undefined) upd.email           = patch.email ? patch.email.trim().toLowerCase() : null
  if (patch.commissionRate !== undefined) upd.commission_rate = patch.commissionRate
  if (patch.status         !== undefined) upd.status          = patch.status
  if (patch.payoutInfo     !== undefined) upd.payout_info     = patch.payoutInfo
  if (patch.note           !== undefined) upd.note            = patch.note
  const { data, error } = await supabase.from('affiliates').update(upd).eq('id', id).select(AFF_COLS).maybeSingle()
  if (error) throw error
  return data ? mapAffiliate(data) : null
}

// Attach / detach a store's referrer.
export async function setStoreAffiliate(storeId: string, affiliateId: string | null): Promise<void> {
  await supabase.from('stores').update({ affiliate_id: affiliateId }).eq('id', storeId)
}

// Called from confirmStorePayment: if the paying store has an active referrer,
// accrue a commission = payment amount × the affiliate's current rate.
export async function createCommissionForPayment(p: { id: string; storeId: string; amount: number }): Promise<void> {
  const { data: store } = await supabase.from('stores').select('affiliate_id').eq('id', p.storeId).maybeSingle()
  const affiliateId = store?.affiliate_id as string | null | undefined
  if (!affiliateId) return
  const { data: aff } = await supabase.from('affiliates').select('commission_rate, status').eq('id', affiliateId).maybeSingle()
  if (!aff || aff.status !== 'active') return
  const rate = Number(aff.commission_rate)
  const amount = Math.round(p.amount * rate * 100) / 100
  if (amount <= 0) return
  await supabase.from('commissions').insert({
    affiliate_id: affiliateId, store_id: p.storeId, payment_id: p.id, amount, rate, status: 'pending',
  })
}

export type CommissionRow = {
  id: string; affiliateId: string; storeId: string; amount: number; rate: number
  status: string; createdAt: string; paidAt: string | null
  storeName?: string; affiliateName?: string
}

function mapCommission(r: Record<string, unknown>): CommissionRow {
  const store = r.stores as { name?: string } | null
  const aff = r.affiliates as { name?: string } | null
  return {
    id:            r.id as string,
    affiliateId:   r.affiliate_id as string,
    storeId:       r.store_id as string,
    amount:        Number(r.amount),
    rate:          Number(r.rate),
    status:        r.status as string,
    createdAt:     r.created_at as string,
    paidAt:        (r.paid_at as string | null) ?? null,
    storeName:     store?.name,
    affiliateName: aff?.name,
  }
}

export async function listCommissions(affiliateId?: string): Promise<CommissionRow[]> {
  let q = supabase.from('commissions').select('*, stores(name), affiliates(name)').order('created_at', { ascending: false })
  if (affiliateId) q = q.eq('affiliate_id', affiliateId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(mapCommission)
}

// Per-affiliate earnings summary (pending vs paid totals).
export type AffiliateEarnings = { affiliateId: string; pending: number; paid: number; total: number }
export async function affiliateEarnings(): Promise<Record<string, AffiliateEarnings>> {
  const { data, error } = await supabase.from('commissions').select('affiliate_id, amount, status')
  if (error) throw error
  const out: Record<string, AffiliateEarnings> = {}
  for (const r of data ?? []) {
    const id = r.affiliate_id as string
    if (!out[id]) out[id] = { affiliateId: id, pending: 0, paid: 0, total: 0 }
    const amt = Number(r.amount)
    out[id].total += amt
    if (r.status === 'paid') out[id].paid += amt
    else out[id].pending += amt
  }
  return out
}

// Mark all of an affiliate's pending commissions as paid (a payout run).
export async function markAffiliatePaid(affiliateId: string): Promise<number> {
  const { data, error } = await supabase.from('commissions')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('affiliate_id', affiliateId).eq('status', 'pending').select('id')
  if (error) throw error
  return (data ?? []).length
}
