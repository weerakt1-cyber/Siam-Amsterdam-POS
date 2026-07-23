export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getMenu, createOrder, getOrderByPlatformOrderId, getConfigMany } from '@/lib/store'
import { getAdapter } from '@/lib/delivery-platforms'
import { appendOrderToSheet } from '@/lib/sheets'
import { sendOrderAlert } from '@/lib/telegram'
import { sendLineOrderAlert } from '@/lib/line'
import { fireWebhook } from '@/lib/webhooks'
import { DELIVERY_CHANNELS } from '@/lib/delivery'

// ─── Inbound platform order webhook ───────────────────────────────────────────
// POST /api/delivery/webhooks/grab  ← GrabFood "Submit Order" push
// Generic across platforms: the adapter authenticates + parses; this route
// creates the POS order (idempotently) and fires the usual alerts so the
// kitchen/staff flow is identical to a manually keyed delivery order.

export async function POST(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params
  const adapter = getAdapter(platform)
  if (!adapter) {
    return NextResponse.json({ error: `No webhook integration for platform "${platform}"` }, { status: 404 })
  }

  // 1. Authenticate the caller before touching the body
  const verdict = await adapter.verifyWebhook(req)
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.error }, { status: verdict.status })
  }

  // 2. Parse platform payload → normalized order
  let normalized
  try {
    normalized = adapter.parseOrder(await req.json())
  } catch (err) {
    console.error(`[Delivery webhook:${platform}] Bad payload:`, err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid payload' }, { status: 400 })
  }

  // 3. Idempotency — platforms redeliver webhooks; never create the order twice
  const existing = await getOrderByPlatformOrderId(normalized.platformOrderId)
  if (existing) {
    return NextResponse.json({ order: existing, duplicate: true })
  }

  // 4. Enrich item names from our menu (platform sends our menuIds via menu sync)
  const menu = await getMenu()
  const items = normalized.items.map(item => {
    const m = menu.find(mi => mi.id === item.menuId)
    return {
      ...item,
      name:   item.name || m?.name || `Item ${item.menuId}`,
      nameTh: m?.nameTh ?? '',
    }
  })

  // 5. Commission rate: per-channel % from app_config (fallback to channel default)
  const commissionKey = `${normalized.channel}_commission`
  const cfg = await getConfigMany([commissionKey])
  const pct = Number(cfg[commissionKey])
  const commissionRate = Number.isFinite(pct) && pct >= 0 && pct <= 100
    ? pct / 100
    : DELIVERY_CHANNELS[normalized.channel].defaultCommission

  const order = await createOrder({
    tableNo:         DELIVERY_CHANNELS[normalized.channel].shortCode,
    items,
    note:            normalized.note,
    source:          'manual',
    orderType:       'delivery',
    channel:         normalized.channel,
    platformCode:    normalized.platformCode,
    platformOrderId: normalized.platformOrderId,
    commissionRate,
  })

  // 6. Auto-accept on the platform if enabled (non-blocking)
  const autoKey = `${normalized.channel}_auto_accept`
  getConfigMany([autoKey]).then(c => {
    if (c[autoKey] === 'true') {
      return adapter.acceptOrder(normalized.platformOrderId, true)
    }
  }).catch(err => console.error(`[Delivery webhook:${platform}] Auto-accept failed:`, err))

  // 7. Same non-blocking side effects as a normal order
  fireWebhook('order.created', order)
    .catch(err => console.error(`[Delivery webhook:${platform}] Webhook delivery failed:`, err))
  appendOrderToSheet(order)
    .catch(err => console.error(`[Delivery webhook:${platform}] Sheets append failed:`, err))
  const notifyPayload = {
    orderId:        order.id,
    tableNo:        `${DELIVERY_CHANNELS[normalized.channel].label} ${normalized.platformCode}`,
    note:           order.note || undefined,
    items:          order.items.map(i => ({ name: i.name, qty: i.qty, price: i.price, variantLabel: i.variantLabel })),
    subtotal:       order.subtotal,
    discountAmount: 0,
    total:          order.total,
    paymentMethod:  normalized.channel,
  }
  sendOrderAlert(notifyPayload)
    .catch(err => console.error(`[Delivery webhook:${platform}] Telegram notify failed:`, err))
  sendLineOrderAlert(notifyPayload)
    .catch(err => console.error(`[Delivery webhook:${platform}] LINE notify failed:`, err))

  return NextResponse.json({ order }, { status: 201 })
}
