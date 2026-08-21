export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getOrders, getMenu, createOrder, recordCouponUse, getMemberByPhone } from '@/lib/store'
import { resolveStoreId } from '@/lib/api-auth'
import { appendOrderToSheet } from '@/lib/sheets'
import { sendOrderAlert } from '@/lib/telegram'
import { sendLineOrderAlert } from '@/lib/line'
import { romanizeName } from '@/lib/romanize'
import { fireWebhook } from '@/lib/webhooks'
import { isDeliveryChannel, DELIVERY_CHANNELS } from '@/lib/delivery'
import type { OrderItem } from '@/lib/types'

export async function GET(req: NextRequest) {
  const storeId = await resolveStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  const orders = await getOrders(storeId)
  return NextResponse.json({ orders })
}

export async function POST(req: NextRequest) {
  try {
    const storeId = await resolveStoreId(req)
    if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })

    const body = await req.json()
    const { tableNo, items, note, source, paymentMethod, discount, memberName, memberPhone, customerName, couponId, couponOrderTotal, couponMemberName, hold, orderType, channel, platformCode, commissionRate } = body

    // QR self-order: the customer may enter their phone to link this order to
    // their member account (points auto-credit when it's paid). Resolve it
    // server-side so the phone is never trusted as a member id.
    let linkedMemberId: string | undefined
    let linkedMemberName: string | undefined = memberName ? String(memberName) : undefined
    if (memberPhone && typeof memberPhone === 'string' && memberPhone.trim()) {
      const m = await getMemberByPhone(memberPhone.trim(), storeId)
      if (m) { linkedMemberId = m.id; linkedMemberName = m.name }
    }

    // Delivery orders: channel is required, tableNo defaults to the channel short code
    const isDelivery = orderType === 'delivery'
    if (isDelivery && !isDeliveryChannel(channel)) {
      return NextResponse.json({ error: 'Valid channel (grab | lineman | shopeefood) is required for delivery orders' }, { status: 400 })
    }
    const resolvedTableNo = tableNo || (isDelivery ? DELIVERY_CHANNELS[channel as keyof typeof DELIVERY_CHANNELS].shortCode : undefined)

    if (!resolvedTableNo || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'tableNo and items are required' }, { status: 400 })
    }

    const menu = await getMenu(storeId)

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
      tableNo:       String(resolvedTableNo),
      items:         enrichedItems,
      note:          note ? String(note) : '',
      source:        source === 'pos' ? 'pos' : source === 'qr' ? 'qr' : 'manual',
      paymentMethod: paymentMethod ? String(paymentMethod) : undefined,
      discount:      discount && typeof discount === 'object' ? discount : undefined,
      memberName:    linkedMemberName,
      memberId:      linkedMemberId,
      customerName:  customerName ? String(customerName) : undefined,
      hold:          Boolean(hold),
      orderType:     isDelivery ? 'delivery' : orderType === 'takeaway' ? 'takeaway' : 'dine-in',
      channel:       isDelivery ? channel : undefined,
      platformCode:  isDelivery && platformCode ? String(platformCode) : undefined,
      commissionRate: isDelivery && Number.isFinite(Number(commissionRate)) ? Number(commissionRate) : undefined,
    }, storeId)

    // B-04: Atomic coupon recording â€” record in the same request as order creation
    if (couponId) {
      try {
        const discountAmt = discount?.amount ?? 0
        await recordCouponUse(String(couponId), discountAmt, Number(couponOrderTotal) || 0, couponMemberName || undefined, storeId)
      } catch (err) {
        console.error('[Orders API] Coupon record failed:', err)
      }
    }

    // Fire outbound webhook (non-blocking)
    fireWebhook('order.created', order)
      .catch((err) => console.error('[Orders API] Webhook delivery failed:', err))

    // Send to Google Sheets (non-blocking)
    appendOrderToSheet(order).catch((err) =>
      console.error('[Orders API] Sheets append failed:', err)
    )

    // à¹à¸ˆà¹‰à¸‡à¹€à¸•à¸·à¸­à¸™ Telegram (non-blocking)
    // à¸”à¸¶à¸‡ couponCode à¸ˆà¸²à¸ discount body à¹€à¸žà¸£à¸²à¸° Order type à¹„à¸¡à¹ˆà¹€à¸à¹‡à¸š field à¸™à¸µà¹‰
    const notifyCoupon = discount && typeof discount === 'object' && 'couponCode' in discount
      ? String((discount as Record<string, unknown>).couponCode ?? '')
      : undefined
    const notifyPayload = {
      orderId:        order.id,
      tableNo:        order.tableNo,
      // Romanize non-Latin names so foreign customer names show an English
      // version in parentheses, e.g. "Иван (Ivan)" / "李明 (Li Ming)".
      memberName:     romanizeName(order.memberName),
      customerName:   romanizeName(order.customerName),
      note:           order.note || undefined,
      couponCode:     notifyCoupon || undefined,
      items:          order.items.map(i => ({ name: i.name, qty: i.qty, price: i.price, variantLabel: i.variantLabel })),
      subtotal:       order.subtotal,
      discountAmount: order.discount?.amount ?? 0,
      total:          order.total,
      paymentMethod:  order.paymentMethod ?? 'cash',
    }
    // Only QR self-orders send a Telegram/LINE alert — that's the case staff
    // need to see (a customer ordered from their phone). Orders rung up at the
    // POS are already in front of the cashier and printed as a receipt, so they
    // must NOT notify (it flooded the channels).
    if (order.source === 'qr') {
      sendOrderAlert(notifyPayload)
        .catch((err) => console.error('[Orders API] Telegram notify failed:', err))
      sendLineOrderAlert(notifyPayload)
        .catch((err) => console.error('[Orders API] LINE notify failed:', err))
    }

    return NextResponse.json({ order, memberLinked: !!linkedMemberId, memberName: linkedMemberName }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
