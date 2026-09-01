import {
  getOrder, updateOrderStatus, getMenuIngredients, adjustStock, awardOrderPoints,
  getInventory,
} from '@/lib/store'
import { fireWebhook } from '@/lib/webhooks'
import { toStockQuantity } from '@/lib/units'
import type { Order } from '@/lib/types'

// Deduct recipe ingredients from stock for every line on a paid order. Shared by
// the order PATCH route and the transfer-slip auto-verify path so both do the
// exact same thing. Best-effort: a missing recipe just means nothing to deduct.
//
// A recipe's quantity is stored in whatever unit the bartender chose (ml, g,
// shot, …). toStockQuantity() converts it into the inventory item's stock unit
// before deducting, so a 50 ml pour correctly cuts 50/700 of a bottle.
export async function deductStockForOrder(orderId: string, storeId: string) {
  const order = await getOrder(orderId, storeId)
  if (!order) return
  // One inventory read for the whole order → a lookup map for unit conversion.
  const invById = new Map((await getInventory(storeId)).map(i => [i.id, i]))
  for (const item of order.items) {
    const ingredients = await getMenuIngredients(item.menuId)
    for (const ing of ingredients) {
      const inv = invById.get(ing.inventoryItemId)
      const perServing = inv
        ? toStockQuantity(ing.quantityPerServing, ing.unit, inv)
        : ing.quantityPerServing
      await adjustStock(
        ing.inventoryItemId,
        -(perServing * item.qty),
        'usage',
        `Order ${orderId} — ${item.name} x${item.qty}`,
        storeId,
      )
    }
  }
}

// Mark an order paid and fire the same paid-time side effects the POS checkout
// path fires (stock deduction, loyalty points, order.paid webhook). Used by the
// transfer auto-verify route so a slip-paid order behaves like any other paid
// order for reports/points/print hooks. All side effects are non-blocking.
export async function markOrderPaid(
  orderId: string, paymentMethod: string, storeId: string,
): Promise<Order | null> {
  const updated = await updateOrderStatus(orderId, 'paid', paymentMethod, storeId)
  if (!updated) return null
  deductStockForOrder(updated.id, storeId).catch(err =>
    console.error('[order-payment] stock deduction failed:', err))
  awardOrderPoints(updated.id, storeId).catch(err =>
    console.error('[order-payment] points award failed:', err))
  fireWebhook('order.paid', updated).catch(err =>
    console.error('[order-payment] webhook delivery failed:', err))
  return updated
}
