export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { validateCoupon, recordCouponUse } from '@/lib/store'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { code, subtotal, memberName, record, orderTotal } = body
    if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })

    const result = await validateCoupon(code, Number(subtotal) || 0, memberName)
    if (!result.valid) return NextResponse.json({ valid: false, error: result.error }, { status: 422 })

    // record=true à¹€à¸¡à¸·à¹ˆà¸­à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸–à¸¹à¸ confirm à¹à¸¥à¹‰à¸§
    if (record && result.coupon) {
      await recordCouponUse(result.coupon.id, result.discountAmount, Number(orderTotal) || 0, memberName)
    }

    return NextResponse.json({
      valid:          true,
      couponId:       result.coupon.id,
      couponCode:     result.coupon.code,
      couponName:     result.coupon.name,
      type:           result.coupon.type,
      value:          result.coupon.value,
      discountAmount: result.discountAmount,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
