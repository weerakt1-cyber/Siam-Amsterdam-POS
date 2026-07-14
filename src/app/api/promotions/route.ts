export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getPromotions, createPromotion } from '@/lib/store'
import type { PromotionType } from '@/lib/types'

// GET — list all promotions. Public (read-only): the QR ordering page reads this
// server-side to show active deals + the promo popup, same as /api/menu.
export async function GET() {
  const promotions = await getPromotions()
  return NextResponse.json({ promotions })
}

const VALID_TYPES: PromotionType[] = ['bundle', 'free_item', 'discount']

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    if (!b.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
    if (!VALID_TYPES.includes(b.type)) return NextResponse.json({ error: 'invalid type' }, { status: 400 })

    const promotion = await createPromotion({
      name:          String(b.name).trim(),
      type:          b.type,
      active:        b.active !== false,
      targetType:    b.targetType === 'category' ? 'category' : 'item',
      targetId:      b.targetId ? String(b.targetId) : undefined,
      buyQty:        b.buyQty != null ? Number(b.buyQty) : undefined,
      bundlePrice:   b.bundlePrice != null ? Number(b.bundlePrice) : undefined,
      freeText:      b.freeText ? String(b.freeText) : undefined,
      discountType:  b.discountType === 'fixed' ? 'fixed' : b.discountType === 'percent' ? 'percent' : undefined,
      discountValue: b.discountValue != null ? Number(b.discountValue) : undefined,
      startDate:     b.startDate || undefined,
      endDate:       b.endDate || undefined,
      startTime:     b.startTime || undefined,
      endTime:       b.endTime || undefined,
      showOnQr:      b.showOnQr !== false,
    })
    return NextResponse.json({ promotion }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
