export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { updateMenuItem, deleteMenuItem } from '@/lib/store'
import { resolveStoreId } from '@/lib/api-auth'
import type { MenuCategory } from '@/lib/types'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const storeId = await resolveStoreId(req)
    if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
    const body = await req.json()

    const updated = await updateMenuItem(id, {
      ...(body.name        !== undefined && { name:        String(body.name) }),
      ...(body.nameTh      !== undefined && { nameTh:      String(body.nameTh) }),
      ...(body.price       !== undefined && { price:       Number(body.price) }),
      ...(body.category    !== undefined && { category:    body.category as MenuCategory }),
      ...(body.available   !== undefined && { available:   Boolean(body.available) }),
      ...(body.cost        !== undefined && { cost:        body.cost === '' ? undefined : Number(body.cost) }),
      ...(body.sku         !== undefined && { sku:         body.sku || undefined }),
      ...(body.description !== undefined && { description: body.description || undefined }),
      ...(body.unit        !== undefined && { unit:        body.unit || undefined }),
      ...(body.taxRate     !== undefined && { taxRate:     Number(body.taxRate) }),
      ...(body.image       !== undefined && { image:       body.image || undefined }),
      ...(body.sortOrder   !== undefined && { sortOrder:   Number(body.sortOrder) }),
      ...(body.variants    !== undefined && { variants:    body.variants }),
    }, storeId)

    if (!updated) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    return NextResponse.json({ item: updated })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const storeId = await resolveStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  const ok = await deleteMenuItem(id, storeId)
  if (!ok) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
