export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getConfigMany, setConfig } from '@/lib/store'

const PUBLIC_KEY = 'omise_public_key'
const SECRET_KEY = 'omise_secret_key'

// Omise keys are prefixed pkey_/skey_ with a `_test_` segment in test mode.
function modeOf(key: string | undefined): 'test' | 'live' | null {
  if (!key) return null
  return key.includes('_test_') ? 'test' : 'live'
}

// GET — returns the publishable key (safe to expose) plus whether a secret key
// is set and which mode the keys are in. The secret key itself is NEVER returned.
export async function GET() {
  try {
    const cfg = await getConfigMany([PUBLIC_KEY, SECRET_KEY])
    const publicKey = cfg[PUBLIC_KEY] || process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY || ''
    const secretKey = cfg[SECRET_KEY] || process.env.OMISE_SECRET_KEY || ''
    return NextResponse.json({
      publicKey,
      secretConfigured: !!secretKey,
      secretLast4: secretKey ? secretKey.slice(-4) : null,
      mode: modeOf(publicKey || secretKey),
      // whether the values come from env (read-only here) vs the DB (editable)
      fromEnv: !cfg[PUBLIC_KEY] && !!process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY,
    })
  } catch (err) {
    console.error('[payment/config] GET', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to load payment config' }, { status: 500 })
  }
}

// POST — save keys. Only fields present in the body are updated; pass an empty
// string to clear a key.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (typeof body.publicKey === 'string') await setConfig(PUBLIC_KEY, body.publicKey.trim())
    if (typeof body.secretKey === 'string') await setConfig(SECRET_KEY, body.secretKey.trim())
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[payment/config] POST', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to save payment config' }, { status: 500 })
  }
}
