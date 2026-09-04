export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, resolveStaffStoreId } from '@/lib/api-auth'
import { getLineOaSettings, broadcastLineOA } from '@/lib/line-oa'

// POST — broadcast a plain-text message to every friend of the store's LINE OA.
// Manager/admin only. body { message }. LINE caps a text message at 5000 chars.
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ['admin', 'manager'])
  if (!gate.ok) return gate.res
  const storeId = await resolveStaffStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })

  let body: { message?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })
  if (message.length > 5000) return NextResponse.json({ error: 'message too long (max 5000)' }, { status: 400 })

  const s = await getLineOaSettings(storeId)
  if (!s.enabled || !s.accessToken) {
    return NextResponse.json({ error: 'LINE OA not connected' }, { status: 400 })
  }

  const out = await broadcastLineOA(s.accessToken, message)
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 502 })
  return NextResponse.json({ ok: true })
}
