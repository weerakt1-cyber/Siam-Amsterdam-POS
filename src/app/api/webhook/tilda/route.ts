import { NextRequest, NextResponse } from 'next/server'
import { createOrder, getMenu } from '@/lib/store'
import { appendOrderToSheet } from '@/lib/sheets'
import type { OrderItem } from '@/lib/types'

// รับ webhook จาก Tilda (form submit / ecommerce order)
// รองรับทั้ง application/json และ application/x-www-form-urlencoded
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
      raw['โต๊ะ'] ??
      raw['tildauid']?.slice(-2) ??
      'Online'

    const note = raw['note'] ?? raw['หมายเหตุ'] ?? raw['comment'] ?? ''

    const menu = await getMenu()
    const items: OrderItem[] = []

    // ลอง parse จาก Tilda ecommerce format (JSON array ใน field "products")
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
        // ถ้า parse ไม่ได้ ข้ามไป
      }
    }

    // Fallback: ดู field qty_<menuId> แบบ custom Tilda form
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

    // ส่งข้อมูลไปยัง Google Sheets (non-blocking)
    appendOrderToSheet(order).catch((err) =>
      console.error('[Tilda webhook] Sheets append failed:', err)
    )

    return NextResponse.json({ success: true, orderId: order.id, tableNo, itemCount: items.length })
  } catch (err) {
    console.error('[Tilda webhook]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// Tilda ตรวจสอบ webhook ด้วย GET ก่อน activate
export async function GET() {
  return NextResponse.json({ status: 'OK', service: 'BAR-ORDER POS — Tilda Webhook Endpoint' })
}
