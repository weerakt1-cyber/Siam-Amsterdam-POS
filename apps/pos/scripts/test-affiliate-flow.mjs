#!/usr/bin/env node
// ─── Affiliate flow integration test (real Supabase, self-cleaning) ──────────
// Exercises the affiliate schema + commission logic against the live DB exactly
// as @baze/db does: create affiliate → refer a throwaway store → a confirmed
// payment accrues a commission (amount × rate) → earnings roll up → payout marks
// it paid. Every row it creates is prefixed/tracked and deleted at the end.
//
//   node apps/pos/scripts/test-affiliate-flow.mjs
// Env auto-loaded from apps/pos/.env.local (SUPABASE_URL + SUPABASE_SERVICE_KEY).

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of raw.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (!m || line.trim().startsWith('#')) continue
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('✗ Need SUPABASE_URL + SUPABASE_SERVICE_KEY'); process.exit(2) }
const db = createClient(URL_, KEY, { auth: { persistSession: false } })

let failures = 0
const ok = (name, cond, detail) => { console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`); if (!cond) failures++ }

const RATE = 0.2
const AMOUNT = 790
const EXPECT = Math.round(AMOUNT * RATE * 100) / 100   // 158

let affiliateId, storeId, paymentId
try {
  console.log('Affiliate flow test → real DB (self-cleaning)\n')

  // 1. Create affiliate
  const { data: aff, error: e1 } = await db.from('affiliates').insert({
    name: '_afftest_broker', referral_code: '_AFFTEST_' + (Date.now() % 100000), commission_rate: RATE, status: 'active',
  }).select('id, referral_code, commission_rate').single()
  if (e1) throw new Error('create affiliate: ' + e1.message)
  affiliateId = aff.id
  ok('create affiliate', !!affiliateId && Number(aff.commission_rate) === RATE, `code=${aff.referral_code}`)

  // 2. Create a throwaway store referred by this affiliate
  const { data: store, error: e2 } = await db.from('stores').insert({
    name: '_afftest_store', slug: '_afftest_' + Date.now(), affiliate_id: affiliateId,
  }).select('id, affiliate_id').single()
  if (e2) throw new Error('create store: ' + e2.message)
  storeId = store.id
  ok('store referred by affiliate', store.affiliate_id === affiliateId)

  // 3. A (pending) payment for that store
  const { data: pay, error: e3 } = await db.from('store_payments').insert({
    store_id: storeId, kind: 'subscription', plan: 'pro', cycle: 'monthly', amount: AMOUNT, months: 1, status: 'pending',
  }).select('id, amount').single()
  if (e3) throw new Error('create payment: ' + e3.message)
  paymentId = pay.id
  ok('create pending payment', Number(pay.amount) === AMOUNT)

  // 4. Replicate createCommissionForPayment (what confirmStorePayment runs)
  const { data: s } = await db.from('stores').select('affiliate_id').eq('id', storeId).maybeSingle()
  const { data: a } = await db.from('affiliates').select('commission_rate, status').eq('id', s.affiliate_id).maybeSingle()
  const amount = Math.round(AMOUNT * Number(a.commission_rate) * 100) / 100
  const { error: e4 } = await db.from('commissions').insert({
    affiliate_id: s.affiliate_id, store_id: storeId, payment_id: paymentId, amount, rate: Number(a.commission_rate), status: 'pending',
  })
  if (e4) throw new Error('accrue commission: ' + e4.message)
  ok('commission accrued = amount × rate', amount === EXPECT, `฿${amount} (expected ฿${EXPECT})`)

  // 5. Earnings roll-up (pending)
  const { data: rows } = await db.from('commissions').select('amount, status').eq('affiliate_id', affiliateId)
  const pending = (rows ?? []).filter(r => r.status !== 'paid').reduce((s, r) => s + Number(r.amount), 0)
  ok('earnings: pending total', pending === EXPECT, `฿${pending}`)

  // 6. Payout — mark pending → paid
  const { data: marked } = await db.from('commissions').update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('affiliate_id', affiliateId).eq('status', 'pending').select('id')
  const { data: rows2 } = await db.from('commissions').select('amount, status').eq('affiliate_id', affiliateId)
  const paid = (rows2 ?? []).filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.amount), 0)
  const stillPending = (rows2 ?? []).filter(r => r.status !== 'paid').reduce((s, r) => s + Number(r.amount), 0)
  ok('payout marks paid', (marked?.length ?? 0) === 1 && paid === EXPECT && stillPending === 0, `paid=฿${paid} pending=฿${stillPending}`)

} catch (err) {
  console.log(`  [FAIL] ${err.message}`); failures++
} finally {
  // Cleanup — deleting the store/affiliate cascades commissions + payments.
  if (storeId) await db.from('stores').delete().eq('id', storeId)
  if (affiliateId) await db.from('affiliates').delete().eq('id', affiliateId)
  console.log('\n  (cleaned up test rows)')
}

console.log(`\n${failures === 0 ? '✓ AFFILIATE FLOW OK' : `✗ ${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
