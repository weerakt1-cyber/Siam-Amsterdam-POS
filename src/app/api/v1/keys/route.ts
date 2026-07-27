export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { generateApiKey, listApiKeys, revokeApiKey, requireRole } from '@/lib/api-auth'

// Internal route — owner-only. Managing API keys (mint/list/revoke) is an admin
// action, verified server-side against the caller's Supabase profile role.

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['admin'])
  if (!auth.ok) return auth.res
  try {
    const keys = await listApiKeys()
    return NextResponse.json({ keys })
  } catch (err) {
    console.error('[API keys GET]', err)
    return NextResponse.json({ keys: [] })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin'])
  if (!auth.ok) return auth.res
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
  const auth = await requireRole(req, ['admin'])
  if (!auth.ok) return auth.res
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
