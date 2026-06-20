import { NextRequest, NextResponse } from 'next/server'
import { getCoupons, createCoupon } from '@/lib/store'

export async function GET() {
  const coupons = await getCoupons()
  return NextResponse.json({ coupons })
}

export async function POST(req: NextRequest) {
  try {
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
    })
    return NextResponse.json({ coupon }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
