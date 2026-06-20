import { NextRequest, NextResponse } from 'next/server'
import { getOrders, getMenu, createOrder, recordCouponUse } from '@/lib/store'
import { appendOrderToSheet } from '@/lib/sheets'
import { sendOrderAlert } from '@/lib/telegram'
import type { OrderItem } from '@/lib/types'

export async function GET() {
  const orders = await getOrders()
  return NextResponse.json({ orders })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { tableNo, items, note, source, paymentMethod, discount, memberName, couponId, couponOrderTotal, couponMemberName } = body

    if (!tableNo || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'tableNo and items are required' }, { status: 400 })
    }

    const menu = await getMenu()

    // B-05: Validate required variants are provided
    for (const item of items as (Partial<OrderItem> & { menuId: string; variantLabel?: string })[]) {
      const menuItem = menu.find((m) => m.id === item.menuId)
      if (menuItem?.variants?.some(v => v.required) && !item.variantLabel) {
        return NextResponse.json(
          { error: `"${menuItem.name}" requires a variant selection` },
          { status: 400 }
        )
      }
    }

    const enrichedItems: OrderItem[] = (items as (Partial<OrderItem> & { menuId: string; variantLabel?: string })[]).map((item) => {
      const menuItem = menu.find((m) => m.id === item.menuId)
      return {
        menuId:       item.menuId,
        name:         menuItem?.name ?? item.name ?? 'Unknown',
        nameTh:       menuItem?.nameTh ?? item.nameTh ?? '',
        qty:          Number(item.qty) || 1,
        price:        Number(item.price) ?? menuItem?.price ?? 0,
        variantLabel: item.variantLabel ?? undefined,
      }
    })

    const order = await createOrder({
      tableNo:       String(tableNo),
      items:         enrichedItems,
      note:          note ? String(note) : '',
      source:        source === 'pos' ? 'pos' : source === 'tilda' ? 'tilda' : 'manual',
      paymentMethod: paymentMethod ? String(paymentMethod) : undefined,
      discount:      discount && typeof discount === 'object' ? discount : undefined,
      memberName:    memberName ? String(memberName) : undefined,
    })

    // B-04: Atomic coupon recording — record in the same request as order creation
    if (couponId) {
      try {
        const discountAmt = discount?.amount ?? 0
        await recordCouponUse(String(couponId), discountAmt, Number(couponOrderTotal) || 0, couponMemberName || undefined)
      } catch (err) {
        console.error('[Orders API] Coupon record failed:', err)
      }
    }

    // Send to Google Sheets (non-blocking)
    appendOrderToSheet(order).catch((err) =>
      console.error('[Orders API] Sheets append failed:', err)
    )

    // แจ้งเตือน Telegram (non-blocking)
    // ดึง couponCode จาก discount body เพราะ Order type ไม่เก็บ field นี้
    const notifyCoupon = discount && typeof discount === 'object' && 'couponCode' in discount
      ? String((discount as Record<string, unknown>).couponCode ?? '')
      : undefined
    sendOrderAlert({
      orderId:        order.id,
      tableNo:        order.tableNo,
      memberName:     order.memberName,
      couponCode:     notifyCoupon || undefined,
      items:          order.items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
      subtotal:       order.subtotal,
      discountAmount: order.discount?.amount ?? 0,
      total:          order.total,
      paymentMethod:  order.paymentMethod ?? 'cash',
    }).catch((err) => console.error('[Orders API] Telegram notify failed:', err))

    return NextResponse.json({ order }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
