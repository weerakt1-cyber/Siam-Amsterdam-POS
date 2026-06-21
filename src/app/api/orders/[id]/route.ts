export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getOrder, updateOrderStatus } from '@/lib/store'
import type { OrderStatus } from '@/lib/types'

const VALID_STATUSES: OrderStatus[] = ['pending', 'accepted', 'ready', 'delivered', 'cancelled']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const order = await getOrder(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  return NextResponse.json({ order })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { status } = body

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  const updated = await updateOrderStatus(id, status as OrderStatus)
  if (!updated) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  return NextResponse.json({ order: updated })
}
