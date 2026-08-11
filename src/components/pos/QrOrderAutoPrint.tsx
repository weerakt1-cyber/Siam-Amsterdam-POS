'use client'

import { authedFetch } from '@/lib/supabase-browser'
import { useEffect, useRef, useCallback } from 'react'
import { loadBarSettings, printReceipt, isNativePlatform, type ReceiptData } from '@/lib/printer'
import type { Order } from '@/lib/types'

// Auto-prints an order ticket on THIS device's printer the moment a customer
// places a QR self-order. Runs quietly in the POS layout (like PrinterAutoConnect).
//
// Safeguards:
//  • Seeds a baseline on the first poll after mount, so opening the app never
//    reprints the existing backlog of pending QR orders — only ones that arrive
//    afterwards print.
//  • Remembers printed ids in localStorage, so a reload/tab-switch can't reprint.
//  • Only runs where a printer actually lives (native app, or LAN configured),
//    so the owner's browser doesn't try to print.
//  • A failed print (printer offline/busy) leaves the order unprinted and the
//    next poll retries it.
//  • Per-device toggle (pos_qr_autoprint) — set to 'off' to stop this tablet
//    auto-printing (e.g. when a second tablet already does).

const POLL_MS     = 12_000
const SETTING_KEY = 'pos_qr_autoprint'
const PRINTED_KEY = 'pos_qr_autoprinted'

function enabled(): boolean {
  try { return localStorage.getItem(SETTING_KEY) !== 'off' } catch { return true }  // default ON
}
function loadPrinted(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(PRINTED_KEY) ?? '[]')) } catch { return new Set() }
}
function savePrinted(ids: Set<string>) {
  try { localStorage.setItem(PRINTED_KEY, JSON.stringify([...ids].slice(-300))) } catch { /* ignore */ }
}

export default function QrOrderAutoPrint() {
  const printedRef = useRef<Set<string>>(new Set())
  const seededRef  = useRef(false)
  const busyRef    = useRef(false)

  const poll = useCallback(async () => {
    if (!enabled() || busyRef.current) return

    const cfg = loadBarSettings()
    const canPrint = isNativePlatform() || ((cfg.printerConnectionType ?? 'bluetooth') === 'lan' && !!cfg.printerLanIp)
    if (!canPrint) return   // no printer on this device — nothing to do

    try {
      const r = await authedFetch('/api/orders')
      if (!r.ok) return
      const orders: Order[] = (await r.json()).orders ?? []
      const qr = orders.filter(o => o.source === 'qr')

      if (!seededRef.current) {
        // Everything present at startup counts as already handled.
        printedRef.current = new Set([...loadPrinted(), ...qr.map(o => o.id)])
        savePrinted(printedRef.current)
        seededRef.current = true
        return
      }

      const fresh = qr
        .filter(o => !printedRef.current.has(o.id))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))   // oldest first
      if (fresh.length === 0) return

      busyRef.current = true
      for (const o of fresh) {
        const data: ReceiptData = {
          orderId:        o.id,
          tableNo:        o.tableNo,
          createdAt:      o.createdAt,
          memberName:     o.memberName || o.customerName || undefined,
          items:          o.items.map(i => ({
            name:  i.variantLabel ? `${i.name} (${i.variantLabel})` : i.name,
            qty:   i.qty,
            price: i.price,
          })),
          subtotal:       o.subtotal,
          discountAmount: o.discount?.amount ?? 0,
          total:          o.total,
          vatIncluded:    Math.round(o.total * 7 / 107),
          paymentMethod:  o.paymentMethod,
          note:           o.note || undefined,
        }
        try {
          // Incoming-order ticket: no review QR, no cash-drawer kick.
          await printReceipt(data, cfg)
          printedRef.current.add(o.id)
          savePrinted(printedRef.current)
        } catch {
          // Printer offline/busy — stop; the next poll retries this order.
          break
        }
      }
    } catch { /* ignore — retry next poll */ } finally {
      busyRef.current = false
    }
  }, [])

  useEffect(() => {
    poll()
    const iv = setInterval(poll, POLL_MS)
    const onFocus = () => poll()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(iv); window.removeEventListener('focus', onFocus) }
  }, [poll])

  return null
}
