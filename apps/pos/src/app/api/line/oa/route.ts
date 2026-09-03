export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff, requireRole, resolveStaffStoreId } from '@/lib/api-auth'
import { getLineOaSettings, saveLineOaSettings } from '@/lib/line-oa'

// GET — LINE OA connection status. Staff-readable; NEVER returns the token, only
// whether one is set (plus the public basic id).
export async function GET(req: NextRequest) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.res
  const storeId = await resolveStaffStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  const s = await getLineOaSettings(storeId)
  return NextResponse.json({ enabled: s.enabled, hasToken: !!s.accessToken, basicId: s.basicId })
}

// PUT — save config. Manager/admin only (it holds a channel secret).
//   body { enabled?, accessToken?, basicId? }
// An omitted/blank accessToken keeps the stored one (so toggling enabled or
// editing the basic id doesn't force re-entering the secret).
export async function PUT(req: NextRequest) {
  const gate = await requireRole(req, ['admin', 'manager'])
  if (!gate.ok) return gate.res
  const storeId = await resolveStaffStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })

  let body: { enabled?: unknown; accessToken?: unknown; basicId?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const current = await getLineOaSettings(storeId)
  const accessToken = typeof body.accessToken === 'string' && body.accessToken.trim()
    ? body.accessToken.trim()
    : current.accessToken
  const basicId = typeof body.basicId === 'string' ? body.basicId.trim().slice(0, 40) : current.basicId
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : current.enabled

  await saveLineOaSettings({ enabled, accessToken, basicId }, storeId)
  return NextResponse.json({ enabled, hasToken: !!accessToken, basicId })
}
