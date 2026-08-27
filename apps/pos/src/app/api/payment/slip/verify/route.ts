export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreId, resolveStaffStoreId } from '@/lib/api-auth'
import {
  getOrder, getTransferSettings, insertPaymentSlip, uploadOrderSlip,
  type PaymentSlip,
} from '@/lib/store'
import { markOrderPaid } from '@/lib/order-payment'
import { decodeSlipQr, getVerifier, runSlipChecks } from '@/lib/slip-verify'

// POST /api/payment/slip/verify
//   request  { orderId, qrPayload, image? }   (image = base64 data URL, optional)
//   response { status: 'verified'|'pending'|'rejected',
//              reason: RECEIVER_MISMATCH|AMOUNT_MISMATCH|SLIP_TOO_OLD|
//                      SLIP_ALREADY_USED|INVALID_SLIP|null,
//              slip:   { id, amount, senderName } | null }
//
// Auth: a staff session, OR unauthenticated with a store hint ONLY when the
// target order is a QR self-order (source 'qr'). Unauthenticated calls are
// rate-limited per order. Auto mode marks the order paid on success; manual mode
// (and any vendor failure) records a 'pending' slip for staff to confirm — it
// NEVER auto-approves on API error.

const RATE_LIMIT = 5
const RATE_WINDOW_MS = 10 * 60 * 1000
const attempts = new Map<string, number[]>()  // orderId → recent unauth attempt timestamps

function rateLimited(orderId: string): boolean {
  const nowMs = Date.now()
  const recent = (attempts.get(orderId) ?? []).filter(t => nowMs - t < RATE_WINDOW_MS)
  recent.push(nowMs)
  attempts.set(orderId, recent)
  return recent.length > RATE_LIMIT
}

function slipDto(s: PaymentSlip) {
  return { id: s.id, amount: s.amount, senderName: s.senderName }
}

// Decode a base64 data URL ("data:image/jpeg;base64,...") to bytes + content type.
function parseDataUrl(input: unknown): { bytes: Uint8Array; contentType: string } | null {
  if (typeof input !== 'string') return null
  const m = /^data:(image\/(?:jpeg|png|jpg));base64,(.+)$/i.exec(input.trim())
  if (!m) return null
  try {
    const bytes = new Uint8Array(Buffer.from(m[2], 'base64'))
    if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) return null
    return { bytes, contentType: m[1].toLowerCase() }
  } catch { return null }
}

export async function POST(req: NextRequest) {
  let body: { orderId?: string; qrPayload?: string; image?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const orderId = String(body.orderId ?? '').trim()
  const qrPayload = String(body.qrPayload ?? '').trim()
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })

  // Resolve store: a staff session is authoritative; otherwise fall back to the
  // public store hint (only honoured for QR orders, checked below).
  const staffStoreId = await resolveStaffStoreId(req)
  const isStaff = !!staffStoreId
  const storeId = staffStoreId ?? (await resolveStoreId(req))
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })

  // Fetch within the resolved store — a store-2 hint against a store-1 order 404s.
  const order = await getOrder(orderId, storeId)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // Unauthenticated callers may only pay their own QR self-order.
  if (!isStaff) {
    if (order.source !== 'qr') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    if (rateLimited(orderId)) {
      return NextResponse.json({ error: 'Too many attempts, please wait' }, { status: 429 })
    }
  }

  const settings = await getTransferSettings(storeId)
  if (!settings.enabled) {
    return NextResponse.json({ error: 'Transfer payment not enabled' }, { status: 400 })
  }

  // Optional slip photo → private 'slips' bucket. Non-fatal on failure.
  let imageUrl: string | null = null
  const img = parseDataUrl(body.image)
  if (img) {
    try { imageUrl = await uploadOrderSlip(storeId, orderId, img.bytes, img.contentType) }
    catch (err) { console.error('[slip/verify] image upload failed:', err instanceof Error ? err.message : err) }
  }

  // ── Manual mode → record pending, staff confirms later. Never marks paid. ──
  if (settings.mode === 'manual') {
    const decoded = qrPayload ? decodeSlipQr(qrPayload) : null
    const ins = await insertPaymentSlip({
      orderId, transRef: null, amount: order.total, senderName: null,
      receiverOk: null, method: 'manual', status: 'pending',
      rawPayload: decoded ? { tags: decoded.tags } : null, imageUrl,
    }, storeId)
    if ('error' in ins) return NextResponse.json({ error: 'Failed to record slip' }, { status: 500 })
    return NextResponse.json({ status: 'pending', reason: null, slip: slipDto(ins.slip) })
  }

  // ── Auto mode → verify with SlipOK. ──
  if (!qrPayload) return NextResponse.json({ error: 'qrPayload required' }, { status: 400 })
  // Cheap local gate: obvious non-slip QR is rejected without spending API credit.
  if (!decodeSlipQr(qrPayload)) {
    return NextResponse.json({ status: 'rejected', reason: 'INVALID_SLIP', slip: null })
  }

  const verifier = getVerifier(settings)
  const outcome = verifier ? await verifier.verify(qrPayload) : null

  // Vendor unconfigured / errored / out of credit → degrade to manual pending.
  // NEVER auto-approve on failure.
  if (!outcome || !outcome.ok) {
    if (outcome && outcome.error.reason === 'INVALID_SLIP') {
      return NextResponse.json({ status: 'rejected', reason: 'INVALID_SLIP', slip: null })
    }
    const ins = await insertPaymentSlip({
      orderId, transRef: null, amount: order.total, senderName: null,
      receiverOk: null, method: 'manual', status: 'pending',
      rawPayload: outcome ? { degraded: outcome.error.reason } : { degraded: 'UNCONFIGURED' }, imageUrl,
    }, storeId)
    if ('error' in ins) return NextResponse.json({ error: 'Failed to record slip' }, { status: 500 })
    return NextResponse.json({ status: 'pending', reason: null, slip: slipDto(ins.slip) })
  }

  // Genuine slip → run the receiver / amount / freshness checks.
  const verified = outcome.slip
  const checks = runSlipChecks(verified, settings, order.total)
  if (!checks.pass) {
    return NextResponse.json({ status: 'rejected', reason: checks.reason, slip: null })
  }

  // All checks pass → record verified. The unique (store_id, trans_ref) index is
  // the anti-reuse guarantee: a reused transRef trips 23505 → SLIP_ALREADY_USED.
  const ins = await insertPaymentSlip({
    orderId, transRef: verified.transRef, amount: verified.amount,
    senderName: verified.senderName ?? null, receiverOk: checks.receiverOk,
    method: 'auto', status: 'verified', verifiedBy: null,
    rawPayload: verified.raw, imageUrl,
  }, storeId)
  if ('error' in ins) {
    if (ins.error === '23505') {
      return NextResponse.json({ status: 'rejected', reason: 'SLIP_ALREADY_USED', slip: null })
    }
    return NextResponse.json({ error: 'Failed to record slip' }, { status: 500 })
  }

  // Mark the order paid via the shared path (stock / points / webhook fire).
  await markOrderPaid(orderId, 'transfer', storeId)
  return NextResponse.json({ status: 'verified', reason: null, slip: slipDto(ins.slip) })
}
