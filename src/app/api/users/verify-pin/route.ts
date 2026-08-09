export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { verifyStaffPin, getStaffMember } from '@/lib/store'
import { resolveStoreId } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    const storeId = await resolveStoreId(req)
    if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
    const { id, pin } = await req.json()
    if (!id || !pin) return NextResponse.json({ error: 'id and pin required' }, { status: 400 })
    const valid = await verifyStaffPin(String(id), String(pin), storeId)
    if (!valid) return NextResponse.json({ valid: false })
    // à¸„à¸·à¸™ public profile à¹€à¸¡à¸·à¹ˆà¸­ PIN à¸–à¸¹à¸à¸•à¹‰à¸­à¸‡
    const user = await getStaffMember(String(id), storeId)
    if (!user) return NextResponse.json({ valid: false })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pin: _p, ...pub } = user
    return NextResponse.json({ valid: true, user: pub })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
