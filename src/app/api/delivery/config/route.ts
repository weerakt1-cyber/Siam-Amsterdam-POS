export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getConfigMany, setConfig } from '@/lib/store'
import { GRAB_CONFIG_KEYS } from '@/lib/delivery-platforms/grab'

// ─── Delivery platform API config (server-side, app_config table) ─────────────
// Mirrors /api/payment/config: secrets are write-only — GET returns configured
// flags + last4 only, never the secret values themselves.

export async function GET() {
  try {
    const cfg = await getConfigMany([...GRAB_CONFIG_KEYS])
    return NextResponse.json({
      grab: {
        clientIdConfigured:     !!cfg.grab_client_id,
        clientIdLast4:          cfg.grab_client_id ? cfg.grab_client_id.slice(-4) : null,
        clientSecretConfigured: !!cfg.grab_client_secret,
        merchantId:             cfg.grab_merchant_id || '',
        webhookSecretConfigured: !!cfg.grab_webhook_secret,
        autoAccept:             cfg.grab_auto_accept === 'true',
        commission:             cfg.grab_commission || '',
      },
    })
  } catch (err) {
    console.error('[delivery/config] GET', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to load delivery config' }, { status: 500 })
  }
}

// POST — save Grab keys. Only fields present in the body are updated; pass an
// empty string to clear a key.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const g = body.grab ?? {}
    if (typeof g.clientId      === 'string') await setConfig('grab_client_id', g.clientId.trim())
    if (typeof g.clientSecret  === 'string') await setConfig('grab_client_secret', g.clientSecret.trim())
    if (typeof g.merchantId    === 'string') await setConfig('grab_merchant_id', g.merchantId.trim())
    if (typeof g.webhookSecret === 'string') await setConfig('grab_webhook_secret', g.webhookSecret.trim())
    if (typeof g.autoAccept    === 'boolean') await setConfig('grab_auto_accept', g.autoAccept ? 'true' : 'false')
    if (typeof g.commission    === 'string' || typeof g.commission === 'number') {
      const v = Number(g.commission)
      await setConfig('grab_commission', Number.isFinite(v) && v >= 0 && v <= 100 ? String(v) : '')
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[delivery/config] POST', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to save delivery config' }, { status: 500 })
  }
}
