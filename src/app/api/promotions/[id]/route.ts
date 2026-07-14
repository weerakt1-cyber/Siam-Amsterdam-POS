export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { updatePromotion, deletePromotion } from '@/lib/store'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const b = await req.json()
    const updated = await updatePromotion(id, {
      name:          b.name != null ? String(b.name).trim() : undefined,
      type:          b.type,
      active:        b.active,
      targetType:    b.targetType,
      targetId:      b.targetId !== undefined ? (b.targetId ? String(b.targetId) : undefined) : undefined,
      buyQty:        b.buyQty !== undefined ? (b.buyQty != null ? Number(b.buyQty) : undefined) : undefined,
      bundlePrice:   b.bundlePrice !== undefined ? (b.bundlePrice != null ? Number(b.bundlePrice) : undefined) : undefined,
      freeText:      b.freeText !== undefined ? (b.freeText ? String(b.freeText) : undefined) : undefined,
      discountType:  b.discountType,
      discountValue: b.discountValue !== undefined ? (b.discountValue != null ? Number(b.discountValue) : undefined) : undefined,
      startDate:     b.startDate !== undefined ? (b.startDate || undefined) : undefined,
      endDate:       b.endDate !== undefined ? (b.endDate || undefined) : undefined,
      startTime:     b.startTime !== undefined ? (b.startTime || undefined) : undefined,
      endTime:       b.endTime !== undefined ? (b.endTime || undefined) : undefined,
      showOnQr:      b.showOnQr,
    })
    if (!updated) return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
    return NextResponse.json({ promotion: updated })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ok = await deletePromotion(id)
  if (!ok) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
