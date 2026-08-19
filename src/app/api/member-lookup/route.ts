export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getMemberByPhone } from '@/lib/store'
import { resolveStoreId } from '@/lib/api-auth'

// Public "log in" for the QR order page: a member enters their phone and we
// return their name so they can order without retyping it. Returns only
// { found, name } — the minimum the ordering screen needs. Store-scoped via the
// x-store-id hint (same as the rest of the public order flow).
export async function POST(req: NextRequest) {
  try {
    const storeId = await resolveStoreId(req)
    if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })

    const body = await req.json()
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    if (!phone) return NextResponse.json({ found: false })

    const member = await getMemberByPhone(phone, storeId)
    return NextResponse.json(member ? { found: true, name: member.name } : { found: false })
  } catch (err) {
    console.error('[member-lookup] POST', err instanceof Error ? err.message : err)
    return NextResponse.json({ found: false })
  }
}
