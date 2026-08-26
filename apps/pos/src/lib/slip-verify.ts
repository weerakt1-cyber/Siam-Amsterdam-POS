// ─── Bank-transfer slip verification ─────────────────────────────────────────
// Turns the mini-QR printed on a Thai bank-transfer slip into a verified
// payment. Two layers:
//   1. decodeSlipQr()  — local EMVCo/ITMX TLV parse, cheap validity gate.
//   2. SlipVerifier    — the vendor call (SlipOK) behind an interface so it's
//      swappable; returns the authoritative transRef + amount + receiver.
//   3. runSlipChecks() — receiver / amount / freshness rules, all server-side.
//
// The vendor is only reachable with a real SlipOK API key + branch id, so the
// verify route degrades to 'pending' (manual staff confirm) whenever the vendor
// is unconfigured or errors — it NEVER auto-approves on failure.

import type { TransferSettings } from '@/lib/store'

// ── 1. Local slip-QR decode (EMVCo TLV) ──────────────────────────────────────

export type SlipQr = {
  /** raw tag→value map from the TLV parse */
  tags: Record<string, string>
  /** best-effort transaction reference if the slip encodes one locally */
  refHint: string | null
}

// Parse an EMVCo/ITMX TLV string ("00" + len + value, repeated). Slip mini-QRs
// follow this framing even though the inner ref tag isn't standardised across
// banks, so we surface the whole map and a best-effort hint. Returns null when
// the payload isn't well-formed TLV (obvious garbage / a non-slip QR).
export function decodeSlipQr(payload: string): SlipQr | null {
  const s = (payload ?? '').trim()
  if (s.length < 8) return null
  const tags: Record<string, string> = {}
  let i = 0
  while (i + 4 <= s.length) {
    const tag = s.slice(i, i + 2)
    const len = parseInt(s.slice(i + 2, i + 4), 10)
    if (!/^\d{2}$/.test(s.slice(i + 2, i + 4)) || Number.isNaN(len)) return null
    const start = i + 4
    const end = start + len
    if (end > s.length) return null
    tags[tag] = s.slice(start, end)
    i = end
  }
  if (Object.keys(tags).length === 0) return null
  // Tag 05 on the ITMX slip mini-QR carries the ref in many banks; fall back to
  // any 15–40 char alnum-ish tag value that looks like a transaction id.
  const refHint =
    tags['05'] ||
    Object.values(tags).find(v => /^[A-Za-z0-9]{12,40}$/.test(v)) ||
    null
  return { tags, refHint }
}

// ── 2. Vendor verifier interface ─────────────────────────────────────────────

export type VerifiedSlip = {
  transRef: string
  amount: number
  senderName?: string
  receiverName?: string
  receiverProxy?: string   // promptpay id / account, often masked (e.g. xxx-xxx-1234)
  receiverBank?: string
  transTime?: Date
  raw: unknown
}

export type VerifierError = {
  // API_EXHAUSTED / API_ERROR / UNCONFIGURED → degrade to manual 'pending'.
  // INVALID_SLIP → the slip itself is bad; caller rejects.
  reason: 'INVALID_SLIP' | 'API_ERROR' | 'API_EXHAUSTED' | 'UNCONFIGURED'
  raw?: unknown
}

export type VerifyOutcome =
  | { ok: true; slip: VerifiedSlip }
  | { ok: false; error: VerifierError }

export interface SlipVerifier {
  verify(qrPayload: string): Promise<VerifyOutcome>
}

// SlipOK implementation. Docs (subject to change): POST to
//   https://api.slipok.com/api/line/apikey/{branchId}
// with JSON body { data: <qr payload string> } and header
//   x-authorization: <apiKey>
// Response envelope: { success, code, data: { transRef, amount, sender, receiver,
// transDate, transTime, ... } }. Because the exact field names drift, we read
// defensively and keep the whole response in `raw` for auditing.
export class SlipOkVerifier implements SlipVerifier {
  constructor(private apiKey: string, private branchId: string) {}

  async verify(qrPayload: string): Promise<VerifyOutcome> {
    if (!this.apiKey || !this.branchId) return { ok: false, error: { reason: 'UNCONFIGURED' } }
    let res: Response
    try {
      res = await fetch(`https://api.slipok.com/api/line/apikey/${encodeURIComponent(this.branchId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-authorization': this.apiKey },
        body: JSON.stringify({ data: qrPayload }),
      })
    } catch (err) {
      return { ok: false, error: { reason: 'API_ERROR', raw: String(err) } }
    }

    let json: Record<string, unknown> = {}
    try { json = await res.json() } catch { /* non-JSON error body */ }

    if (!res.ok) {
      // 1012 / quota messages → credit exhausted; anything else → generic error.
      const code = (json.code ?? '') as string | number
      const msg = String(json.message ?? '')
      const exhausted = code === 1012 || /quota|credit|exceed|limit/i.test(msg)
      // A definitively-bad slip (already-used on their side / not a slip) is a
      // client error we can surface as INVALID_SLIP.
      const invalid = res.status === 400 && /invalid|not.*slip|qr/i.test(msg)
      return {
        ok: false,
        error: { reason: exhausted ? 'API_EXHAUSTED' : invalid ? 'INVALID_SLIP' : 'API_ERROR', raw: json },
      }
    }

    const data = (json.data ?? json) as Record<string, unknown>
    const transRef = String(data.transRef ?? data.transRefId ?? data.ref ?? '').trim()
    const amount = Number(data.amount ?? data.paidAmount ?? 0)
    if (!transRef || !(amount > 0)) {
      return { ok: false, error: { reason: 'INVALID_SLIP', raw: json } }
    }

    const receiver = (data.receiver ?? {}) as Record<string, unknown>
    const rcvAccount = (receiver.account ?? {}) as Record<string, unknown>
    const proxy = (rcvAccount.proxy ?? receiver.proxy ?? {}) as Record<string, unknown>
    const sender = (data.sender ?? {}) as Record<string, unknown>
    const sndAccount = (sender.account ?? {}) as Record<string, unknown>

    const transTime = parseSlipTime(data)

    return {
      ok: true,
      slip: {
        transRef,
        amount,
        senderName:   String((sender.name as string) ?? (sndAccount.name as string) ?? '') || undefined,
        receiverName: String((receiver.name as string) ?? (rcvAccount.name as string) ?? '') || undefined,
        receiverProxy: String((proxy.value as string) ?? (rcvAccount.value as string) ?? '') || undefined,
        receiverBank: String((receiver.bank as string) ?? (rcvAccount.bank as string) ?? '') || undefined,
        transTime,
        raw: json,
      },
    }
  }
}

function parseSlipTime(data: Record<string, unknown>): Date | undefined {
  // SlipOK returns transDate (yyyymmdd or ISO) + transTime (HH:mm:ss) or a single
  // transTimestamp. Be liberal; an unparseable time just skips the freshness gate.
  const ts = data.transTimestamp ?? data.transDateTime
  if (ts) { const d = new Date(String(ts)); if (!Number.isNaN(+d)) return d }
  const date = String(data.transDate ?? '')
  const time = String(data.transTime ?? '')
  if (date) {
    const iso = /^\d{8}$/.test(date)
      ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time || '00:00:00'}`
      : `${date}T${time || '00:00:00'}`
    const d = new Date(iso)
    if (!Number.isNaN(+d)) return d
  }
  return undefined
}

// Factory: build the configured verifier, or null when the store hasn't set up
// SlipOK (→ the route degrades to manual 'pending').
export function getVerifier(settings: TransferSettings): SlipVerifier | null {
  if (settings.slipokApiKey && settings.slipokBranchId) {
    return new SlipOkVerifier(settings.slipokApiKey, settings.slipokBranchId)
  }
  return null
}

// ── 3. Server-side check pipeline ─────────────────────────────────────────────

export type SlipCheckReason =
  | 'RECEIVER_MISMATCH' | 'AMOUNT_MISMATCH' | 'SLIP_TOO_OLD'

export type SlipCheckResult = {
  pass: boolean
  reason: SlipCheckReason | null
  receiverOk: boolean
  overpaid: boolean
}

const MAX_SLIP_AGE_MS = 30 * 60 * 1000  // slip must be < 30 min old

// Compare the verified slip against the store's receiving account + the order
// total. Order matters: receiver first (money went to the right place), then
// amount, then freshness.
export function runSlipChecks(
  slip: VerifiedSlip, settings: TransferSettings, orderTotal: number, nowMs = Date.now(),
): SlipCheckResult {
  const receiverOk = receiverMatches(slip, settings)
  const overpaid = slip.amount > orderTotal + 0.001

  if (!receiverOk) return { pass: false, reason: 'RECEIVER_MISMATCH', receiverOk, overpaid }
  // Underpayment fails; overpayment passes but is flagged.
  if (slip.amount + 0.001 < orderTotal) return { pass: false, reason: 'AMOUNT_MISMATCH', receiverOk, overpaid }
  if (slip.transTime && nowMs - slip.transTime.getTime() > MAX_SLIP_AGE_MS) {
    return { pass: false, reason: 'SLIP_TOO_OLD', receiverOk, overpaid }
  }
  return { pass: true, reason: null, receiverOk, overpaid }
}

// Receiver data on a slip is usually masked (xxx-xxx-1234 / partial name), so we
// match leniently: the store's promptpayId digits must end-with the slip's proxy
// digits (or vice-versa), OR the account name must overlap. Conservative — a
// blank store config can't match, forcing manual review.
function receiverMatches(slip: VerifiedSlip, settings: TransferSettings): boolean {
  const wantId = digits(settings.promptpayId)
  const gotId = digits(slip.receiverProxy ?? '')
  if (wantId && gotId) {
    const a = wantId.slice(-8), b = gotId.slice(-8)
    if (a.endsWith(b) || b.endsWith(a)) return true
  }
  const wantName = normName(settings.accountName)
  const gotName = normName(slip.receiverName ?? '')
  if (wantName && gotName && (wantName.includes(gotName) || gotName.includes(wantName))) return true
  return false
}

function digits(s: string): string { return (s || '').replace(/\D/g, '') }
function normName(s: string): string {
  return (s || '').toLowerCase().replace(/(นาย|นาง|นางสาว|น\.ส\.|mr|mrs|ms|miss)\.?\s*/g, '').replace(/\s+/g, ' ').trim()
}
