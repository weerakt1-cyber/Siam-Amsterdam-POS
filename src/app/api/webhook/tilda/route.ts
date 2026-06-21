export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { createOrder, getMenu } from '@/lib/store'
import { appendOrderToSheet } from '@/lib/sheets'
import type { OrderItem } from '@/lib/types'

// à¸£à¸±à¸š webhook à¸ˆà¸²à¸ Tilda (form submit / ecommerce order)
// à¸£à¸­à¸‡à¸£à¸±à¸šà¸—à¸±à¹‰à¸‡ application/json à¹à¸¥à¸° application/x-www-form-urlencoded
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? ''
    let raw: Record<string, string> = {}

    if (contentType.includes('application/json')) {
      raw = await req.json()
    } else {
      const text = await req.text()
      new URLSearchParams(text).forEach((v, k) => {
        raw[k.toLowerCase()] = v
      })
    }

    const tableNo =
      raw['tablenum'] ??
      raw['table_no'] ??
      raw['table'] ??
      raw['à¹‚à¸•à¹Šà¸°'] ??
      raw['tildauid']?.slice(-2) ??
      'Online'

    const note = raw['note'] ?? raw['à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸'] ?? raw['comment'] ?? ''

    const menu = await getMenu()
    const items: OrderItem[] = []

    // à¸¥à¸­à¸‡ parse à¸ˆà¸²à¸ Tilda ecommerce format (JSON array à¹ƒà¸™ field "products")
    const productsRaw = raw['products'] ?? raw['cart'] ?? ''
    if (productsRaw) {
      try {
        const products: Array<{ name?: string; quantity?: number; amount?: number; price?: number }> =
          JSON.parse(productsRaw)
        for (const p of products) {
          const menuItem = menu.find(
            (m) =>
              m.name.toLowerCase() === (p.name ?? '').toLowerCase() ||
              m.nameTh === p.name
          )
          items.push({
            menuId: menuItem?.id ?? 'unknown',
            name:   p.name ?? menuItem?.name ?? 'Unknown',
            nameTh: menuItem?.nameTh ?? '',
            qty:    Number(p.quantity ?? 1),
            price:  Number(p.price ?? p.amount ?? menuItem?.price ?? 0),
          })
        }
      } catch {
        // à¸–à¹‰à¸² parse à¹„à¸¡à¹ˆà¹„à¸”à¹‰ à¸‚à¹‰à¸²à¸¡à¹„à¸›
      }
    }

    // Fallback: à¸”à¸¹ field qty_<menuId> à¹à¸šà¸š custom Tilda form
    if (items.length === 0) {
      for (const menuItem of menu) {
        const qty = Number(raw[`qty_${menuItem.id}`] ?? raw[menuItem.name.toLowerCase()] ?? 0)
        if (qty > 0) {
          items.push({ menuId: menuItem.id, name: menuItem.name, nameTh: menuItem.nameTh, qty, price: menuItem.price })
        }
      }
    }

    // Last resort: generic order entry
    if (items.length === 0) {
      const orderText = raw['order'] ?? raw['orderinfo'] ?? raw['name'] ?? 'Order from Tilda'
      const sum = Number(raw['sum'] ?? raw['price'] ?? 0)
      items.push({ menuId: 'tilda-generic', name: orderText, nameTh: orderText, qty: 1, price: sum })
    }

    const order = await createOrder({ tableNo, items, note, source: 'tilda' })

    // à¸ªà¹ˆà¸‡à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹„à¸›à¸¢à¸±à¸‡ Google Sheets (non-blocking)
    appendOrderToSheet(order).catch((err) =>
      console.error('[Tilda webhook] Sheets append failed:', err)
    )

    return NextResponse.json({ success: true, orderId: order.id, tableNo, itemCount: items.length })
  } catch (err) {
    console.error('[Tilda webhook]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// Tilda à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸š webhook à¸”à¹‰à¸§à¸¢ GET à¸à¹ˆà¸­à¸™ activate
export async function GET() {
  return NextResponse.json({ status: 'OK', service: 'BAR-ORDER POS â€” Tilda Webhook Endpoint' })
}
