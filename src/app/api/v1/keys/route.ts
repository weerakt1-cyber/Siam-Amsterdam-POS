export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { generateApiKey, listApiKeys, revokeApiKey } from '@/lib/api-auth'

// Internal route — protected by POS session auth (manager-only UI calls this).
// Not protected by API key itself since the key doesn't exist yet when first generating.

export async function GET() {
  try {
    const keys = await listApiKeys()
    return NextResponse.json({ keys })
  } catch (err) {
    console.error('[API keys GET]', err)
    return NextResponse.json({ keys: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const label = (body.label as string | undefined)?.trim() || 'Default'
    const { raw, id } = await generateApiKey(label)
    return NextResponse.json({ id, label, key: raw }, { status: 201 })
  } catch (err) {
    console.error('[API keys POST]', err)
    return NextResponse.json({ error: 'Failed to generate key' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await revokeApiKey(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[API keys DELETE]', err)
    return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 })
  }
}
