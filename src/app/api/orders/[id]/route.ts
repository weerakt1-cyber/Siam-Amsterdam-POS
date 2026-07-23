export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getOrder, updateOrderStatus, getMenuIngredients, adjustStock } from '@/lib/store'
import { fireWebhook } from '@/lib/webhooks'
import { getAdapter } from '@/lib/delivery-platforms'
import type { OrderStatus } from '@/lib/types'

const VALID_STATUSES: OrderStatus[] = ['pending', 'accepted', 'ready', 'delivered', 'cancelled', 'paid']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const order = await getOrder(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  return NextResponse.json({ order })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { status, paymentMethod } = body

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  const updated = await updateOrderStatus(id, status as OrderStatus, paymentMethod ? String(paymentMethod) : undefined)
  if (!updated) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // Delivery webhook orders: relay status changes back to the platform (non-blocking).
  // Manually keyed delivery orders have no platformOrderId — nothing to relay.
  if (updated.channel && updated.platformOrderId) {
    const adapter = getAdapter(updated.channel)
    if (adapter) {
      const pid = updated.platformOrderId
      if (status === 'accepted') {
        adapter.acceptOrder(pid, true).catch(err =>
          console.error(`[Orders PATCH] ${updated.channel} accept relay failed:`, err))
      } else if (status === 'ready') {
        adapter.markOrderReady(pid).catch(err =>
          console.error(`[Orders PATCH] ${updated.channel} mark-ready relay failed:`, err))
      } else if (status === 'cancelled') {
        adapter.acceptOrder(pid, false).catch(err =>
          console.error(`[Orders PATCH] ${updated.channel} reject relay failed:`, err))
      }
    }
  }

  if (status === 'paid') {
    deductStockForOrder(updated.id).catch(err =>
      console.error('[Orders PATCH] Stock deduction failed:', err)
    )
    fireWebhook('order.paid', updated).catch(err =>
      console.error('[Orders PATCH] Webhook delivery failed:', err)
    )
  }

  return NextResponse.json({ order: updated })
}

async function deductStockForOrder(orderId: string) {
  const order = await getOrder(orderId)
  if (!order) return

  for (const item of order.items) {
    const ingredients = await getMenuIngredients(item.menuId)
    for (const ing of ingredients) {
      await adjustStock(
        ing.inventoryItemId,
        -(ing.quantityPerServing * item.qty),
        'usage',
        `Order ${orderId} — ${item.name} x${item.qty}`,
      )
    }
  }
}
