export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getCoupon, updateCoupon, deleteCoupon, getCouponUses } from '@/lib/store'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [coupon, uses] = await Promise.all([getCoupon(id), getCouponUses(id)])
  if (!coupon) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ coupon, uses })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await req.json()
    if (body.code) body.code = String(body.code).toUpperCase().trim()
    const updated = await updateCoupon(id, body)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ coupon: updated })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ok = await deleteCoupon(id)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
