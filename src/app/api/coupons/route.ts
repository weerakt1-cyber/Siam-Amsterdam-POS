export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getCoupons, createCoupon } from '@/lib/store'
import { resolveStaffStoreId } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const storeId = await resolveStaffStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const coupons = await getCoupons(storeId)
  return NextResponse.json({ coupons })
}

export async function POST(req: NextRequest) {
  try {
    const storeId = await resolveStaffStoreId(req)
    if (!storeId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const body = await req.json()
    const { code, name, type, value, minOrder, maxUses, active, memberOnly, startDate, endDate, description } = body
    if (!code || !name || !type) return NextResponse.json({ error: 'code, name, type required' }, { status: 400 })
    const coupon = await createCoupon({
      code:        String(code).toUpperCase().trim(),
      name:        String(name).trim(),
      description: description || undefined,
      type,
      value:       Number(value) || 0,
      minOrder:    Number(minOrder) || 0,
      maxUses:     Number(maxUses) || 0,
      active:      active !== false,
      memberOnly:  memberOnly === true,
      startDate:   startDate || undefined,
      endDate:     endDate || undefined,
    }, storeId)
    return NextResponse.json({ coupon }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
