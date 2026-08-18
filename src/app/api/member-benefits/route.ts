export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getConfig, setConfig } from '@/lib/store'
import { resolveStoreId, requireRole } from '@/lib/api-auth'

const KEY = 'member_benefits'

type Benefit = { icon: string; text: string }

// GET — public (via the store hint): the register page reads these to show what
// customers get by signing up. Returns [] when the store hasn't set any (the
// page then falls back to its own default list).
export async function GET(req: NextRequest) {
  const storeId = await resolveStoreId(req)
  if (!storeId) return NextResponse.json({ benefits: [] })
  try {
    const raw = await getConfig(KEY, storeId)
    const benefits: Benefit[] = raw ? JSON.parse(raw) : []
    return NextResponse.json({ benefits: Array.isArray(benefits) ? benefits : [] })
  } catch (err) {
    console.error('[member-benefits] GET', err instanceof Error ? err.message : err)
    return NextResponse.json({ benefits: [] })
  }
}

// POST — admin/manager only. Full-replace with the ordered list.
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ['admin', 'manager'])
  if (!gate.ok) return gate.res
  const storeId = gate.profile.store_id ?? (await resolveStoreId(req))
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  try {
    const body = await req.json()
    const benefits: Benefit[] = Array.isArray(body.benefits)
      ? body.benefits
          .filter((b: unknown): b is Benefit => !!b && typeof (b as Benefit).text === 'string')
          .map((b: Benefit) => ({ icon: String(b.icon ?? '⭐').slice(0, 8), text: String(b.text).trim().slice(0, 120) }))
          .filter((b: Benefit) => b.text.length > 0)
          .slice(0, 12)
      : []
    await setConfig(KEY, JSON.stringify(benefits), storeId)
    return NextResponse.json({ benefits })
  } catch (err) {
    console.error('[member-benefits] POST', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to save benefits' }, { status: 500 })
  }
}
