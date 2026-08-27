export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getConfigMany, setConfig } from '@/lib/store'
import { getSessionProfile, requireRole, resolveStoreId, resolveStaffStoreId } from '@/lib/api-auth'

const PUBLIC_KEY = 'omise_public_key'
const SECRET_KEY = 'omise_secret_key'
// Per-store bank-transfer / PromptPay-slip receiving config (see migration 025).
const TRANSFER_KEY = 'transfer_settings'

type TransferSettings = {
  enabled?: boolean
  mode?: 'auto' | 'manual'
  promptpayId?: string
  accountName?: string
  bankCode?: string
  slipokApiKey?: string
  slipokBranchId?: string
}

function parseTransfer(raw: string | null | undefined): TransferSettings {
  if (!raw) return {}
  try { return JSON.parse(raw) as TransferSettings } catch { return {} }
}

// Omise keys are prefixed pkey_/skey_ with a `_test_` segment in test mode.
function modeOf(key: string | undefined): 'test' | 'live' | null {
  if (!key) return null
  return key.includes('_test_') ? 'test' : 'live'
}

// GET — the publishable key is public (the customer checkout on their own phone
// needs it, unauthenticated). Secret metadata (configured flag / last4 / source)
// is returned ONLY to an admin caller. The secret key itself is NEVER returned.
export async function GET(req: NextRequest) {
  try {
    const storeId = await resolveStoreId(req)
    if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
    const cfg = await getConfigMany([PUBLIC_KEY, SECRET_KEY, TRANSFER_KEY], storeId)
    const publicKey = cfg[PUBLIC_KEY] || process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY || ''
    const secretKey = cfg[SECRET_KEY] || process.env.OMISE_SECRET_KEY || ''
    const transfer  = parseTransfer(cfg[TRANSFER_KEY])

    const profile = await getSessionProfile(req)
    const isAdmin = profile?.role === 'admin'

    // Transfer fields the customer pay page legitimately needs to render the
    // PromptPay QR + receiver name. NEVER the SlipOK credentials — those are
    // returned (existence only) exclusively to an admin caller, like the Omise
    // secret above.
    const publicTransfer = {
      enabled:     !!transfer.enabled,
      mode:        transfer.mode === 'manual' ? 'manual' : 'auto',
      promptpayId: transfer.promptpayId ?? '',
      accountName: transfer.accountName ?? '',
      bankCode:    transfer.bankCode ?? '',
    }

    return NextResponse.json({
      publicKey,
      mode: modeOf(publicKey || secretKey),
      transfer: publicTransfer,
      // Secret status is owner-only; anonymous/customer callers see just the publishable key.
      ...(isAdmin ? {
        secretConfigured: !!secretKey,
        secretLast4: secretKey ? secretKey.slice(-4) : null,
        // whether the values come from env (read-only here) vs the DB (editable)
        fromEnv: !cfg[PUBLIC_KEY] && !!process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY,
        // SlipOK credentials: report configured-flags + branch id, never the key.
        transferAdmin: {
          slipokConfigured: !!transfer.slipokApiKey,
          slipokBranchId:   transfer.slipokBranchId ?? '',
        },
      } : {}),
    })
  } catch (err) {
    console.error('[payment/config] GET', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to load payment config' }, { status: 500 })
  }
}

// POST — save keys (owner-only). Only fields present in the body are updated;
// pass an empty string to clear a key.
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin'])
  if (!auth.ok) return auth.res
  const storeId = auth.profile.store_id ?? (await resolveStaffStoreId(req))
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  try {
    const body = await req.json()
    if (typeof body.publicKey === 'string') await setConfig(PUBLIC_KEY, body.publicKey.trim(), storeId)
    if (typeof body.secretKey === 'string') await setConfig(SECRET_KEY, body.secretKey.trim(), storeId)

    // Transfer settings: merge onto the stored object so a save that omits the
    // SlipOK key (the UI never round-trips it) doesn't wipe it. Pass an empty
    // string for slipokApiKey to clear it explicitly.
    if (body.transfer && typeof body.transfer === 'object') {
      const existing = parseTransfer((await getConfigMany([TRANSFER_KEY], storeId))[TRANSFER_KEY])
      const t = body.transfer as TransferSettings
      const merged: TransferSettings = {
        enabled:        typeof t.enabled === 'boolean' ? t.enabled : existing.enabled ?? false,
        mode:           t.mode === 'manual' || t.mode === 'auto' ? t.mode : existing.mode ?? 'manual',
        promptpayId:    typeof t.promptpayId === 'string' ? t.promptpayId.trim() : existing.promptpayId ?? '',
        accountName:    typeof t.accountName === 'string' ? t.accountName.trim() : existing.accountName ?? '',
        bankCode:       typeof t.bankCode === 'string' ? t.bankCode.trim() : existing.bankCode ?? '',
        slipokApiKey:   typeof t.slipokApiKey === 'string' ? t.slipokApiKey.trim() : existing.slipokApiKey ?? '',
        slipokBranchId: typeof t.slipokBranchId === 'string' ? t.slipokBranchId.trim() : existing.slipokBranchId ?? '',
      }
      await setConfig(TRANSFER_KEY, JSON.stringify(merged), storeId)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[payment/config] POST', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to save payment config' }, { status: 500 })
  }
}
