export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getOrder } from '@/lib/store'
import QRCode from 'qrcode'

const MAPS_REVIEW_URL = 'https://www.google.com/maps/place/Bar+Siam+Amsterdam/@12.9634159,100.8876897,16.96z/data=!4m8!3m7!1s0x31029569141e1951:0x8eadca38f19041b6!8m2!3d12.9639884!4d100.889355!9m1!1b1!16s%2Fg%2F11tg260j3m'

function baht(n: number) {
  return '฿' + new Intl.NumberFormat('en').format(Math.round(n))
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const order = await getOrder(orderId)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const now = new Date(order.createdAt)
  const dateStr = now.toLocaleDateString('en-GB')
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const vatIncluded = Math.round(order.total * 7 / 107)
  const qrDataUrl = await QRCode.toDataURL(MAPS_REVIEW_URL, { width: 160, margin: 1, errorCorrectionLevel: 'L' })

  const PAY_LABEL: Record<string, string> = {
    cash: '💵 Cash', card: '💳 Card', promptpay: '📱 QR PromptPay',
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt #${order.id.slice(-8).toUpperCase()}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Courier New',monospace; font-size:12px; width:280px; margin:0 auto; padding:14px 10px; color:#111; background:#fff; }
  .center { text-align:center; } .right { text-align:right; }
  .bold { font-weight:bold; } .large { font-size:17px; } .xlarge { font-size:20px; letter-spacing:1px; }
  .row { display:flex; justify-content:space-between; padding:2px 0; }
  .item-name { flex:1; }
  .sep { border-top:1px dashed #aaa; margin:7px 0; } .sep2 { border-top:2px solid #333; margin:7px 0; }
  .small { font-size:10px; color:#777; } .green { color:#1a7a1a; } .gray { color:#555; }
  .total-row { font-size:16px; font-weight:bold; padding:4px 0; }
  .footer { margin-top:10px; text-align:center; font-size:11px; color:#555; }
  .order-ref { font-size:10px; color:#aaa; letter-spacing:1px; }
  @media print { body { padding:0; } }
</style></head>
<body>
<div class="center" style="margin-bottom:10px">
  <p class="bold xlarge">SIAM AMSTERDAM</p>
  <p class="small" style="margin-top:3px">Point of Sale</p>
</div>
<div class="sep"></div>
<div class="row"><span>Date: ${dateStr}</span><span>${timeStr}</span></div>
<div class="row"><span>Table: <strong>${order.tableNo}</strong></span><span class="order-ref">#${order.id.slice(-8).toUpperCase()}</span></div>
${order.memberName ? `<div class="row small"><span>👤 Member: ${order.memberName}</span></div>` : ''}
<div class="sep"></div>
${order.items.map(i => `
  <div class="row">
    <span class="item-name">${i.name}${i.variantLabel ? ` <span class="small">(${i.variantLabel})</span>` : ''}<span class="gray"> ×${i.qty}</span></span>
    <span>${baht(i.price * i.qty)}</span>
  </div>`).join('')}
<div class="sep"></div>
<div class="row gray"><span>Subtotal</span><span>${baht(order.subtotal)}</span></div>
${order.discount && order.discount.amount > 0 ? `
  <div class="row green">
    <span>Discount${order.discount.type === 'percent' ? ` (${order.discount.value}%)` : ''}</span>
    <span>-${baht(order.discount.amount)}</span>
  </div>` : ''}
<div class="sep2"></div>
<div class="row total-row"><span>TOTAL</span><span>${baht(order.total)}</span></div>
<div class="row small"><span>VAT 7% (incl.)</span><span>${baht(vatIncluded)}</span></div>
${order.paymentMethod ? `<div class="row" style="margin-top:4px"><span class="bold">${PAY_LABEL[order.paymentMethod] ?? order.paymentMethod.toUpperCase()}</span></div>` : ''}
${order.note ? `<div class="sep"></div><div class="small">Note: ${order.note}</div>` : ''}
<div class="sep"></div>
<div class="center" style="margin:10px 0 6px">
  <p style="font-size:11px;font-weight:bold;margin-bottom:5px">⭐ Rate us on Google Maps!</p>
  <img src="${qrDataUrl}" style="width:140px;height:140px;display:block;margin:0 auto" alt="Google Maps Review QR Code">
  <p class="small" style="margin-top:4px;color:#555">Scan to leave a review 🙏</p>
</div>
<div class="sep"></div>
<div class="footer">Thank you for visiting!<br><span style="font-size:10px;color:#bbb">SIAM AMSTERDAM POS</span></div>
</body></html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
