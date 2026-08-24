export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getCoupon, updateCoupon, deleteCoupon, getCouponUses } from '@/lib/store'
import { resolveStaffStoreId } from '@/lib/api-auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const storeId = await resolveStaffStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const [coupon, uses] = await Promise.all([getCoupon(id, storeId), getCouponUses(id, storeId)])
  if (!coupon) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ coupon, uses })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const storeId = await resolveStaffStoreId(req)
    if (!storeId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const body = await req.json()
    if (body.code) body.code = String(body.code).toUpperCase().trim()
    const updated = await updateCoupon(id, body, storeId)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ coupon: updated })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const storeId = await resolveStaffStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const ok = await deleteCoupon(id, storeId)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
