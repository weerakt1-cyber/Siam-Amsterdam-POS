// Promotion engine — pure, side-effect-free. Runs identically in the POS cart
// (src/app/pos/page.tsx) and the QR ordering cart (src/app/order/[tableNo]).
//
// Three mechanics (see supabase/migrations/006_add_promotions.sql):
//   bundle    — buy N of a specific item for a fixed total price (e.g. 2 Shots
//               = 250 instead of 300). Applied per cart line of the target item.
//   discount  — % or ฿ off a specific item OR a whole category, usually time-
//               limited (happy hour). Applied per matching cart line.
//   free_item — buy N of a specific item → get something free. TAG/NOTE ONLY:
//               no price change, no extra line, no stock deduction.

import type { Promotion } from './types'

// ─── "Active right now" — date range AND/OR daily time window ─────────────────

// `now` is passed in (the caller's local clock, which for this app's Thailand
// venues ≈ Asia/Bangkok). No timing fields set → always active while active=true.
export function isPromotionActiveNow(p: Promotion, now: Date): boolean {
  if (!p.active) return false

  // Calendar date range (inclusive), compared in local YYYY-MM-DD.
  const ymd = toLocalYmd(now)
  if (p.startDate && ymd < p.startDate) return false
  if (p.endDate && ymd > p.endDate) return false

  // Daily time window. If only one of start/end is set, ignore the window.
  if (p.startTime && p.endTime) {
    const cur = now.getHours() * 60 + now.getMinutes()
    const start = hhmmToMinutes(p.startTime)
    const end = hhmmToMinutes(p.endTime)
    if (start === null || end === null) return true
    if (start <= end) {
      // Same-day window, e.g. 17:00–19:00
      if (cur < start || cur >= end) return false
    } else {
      // Wraps past midnight, e.g. 22:00–02:00 → active if after start OR before end
      if (cur < start && cur >= end) return false
    }
  }
  return true
}

function toLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function hhmmToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1]); const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

// ─── Apply promotions to a cart ────────────────────────────────────────────────

export type PromoCartLine = {
  key: string          // stable per-line key (POS: cartKey; QR: index-based)
  menuId: string
  qty: number
  unitPrice: number    // effective unit price already in the cart (post variant/manual)
}

export type LinePromo = { amount: number; label: string }  // ฿ off this line + tag text
export type Freebie = { promoId: string; text: string; qty: number }

export type PromoResult = {
  lineDiscounts: Record<string, LinePromo>  // keyed by PromoCartLine.key
  freebies: Freebie[]
  totalDiscount: number
}

// menuCategoryOf: menuId -> category value, for category-target discount promos.
export function applyPromotions(
  lines: PromoCartLine[],
  promos: Promotion[],
  now: Date,
  menuCategoryOf: (menuId: string) => string | undefined,
): PromoResult {
  const active = promos.filter(p => isPromotionActiveNow(p, now))
  const lineDiscounts: Record<string, LinePromo> = {}
  const freebies: Freebie[] = []
  let totalDiscount = 0

  // Aggregate quantity per menuId (bundle & free_item trigger on total qty of
  // the target item across lines, e.g. two separate variant lines of "Leo").
  const qtyByMenu = new Map<string, number>()
  for (const l of lines) qtyByMenu.set(l.menuId, (qtyByMenu.get(l.menuId) ?? 0) + l.qty)

  for (const p of active) {
    if (p.type === 'discount') {
      for (const l of lines) {
        const matches = p.targetType === 'category'
          ? menuCategoryOf(l.menuId) === p.targetId
          : l.menuId === p.targetId
        if (!matches) continue
        const lineTotal = l.unitPrice * l.qty
        let off = 0
        let label = ''
        if (p.discountType === 'percent') {
          const pct = clamp(p.discountValue ?? 0, 0, 100)
          off = Math.round(lineTotal * pct / 100)
          label = `-${pct}%`
        } else {
          const per = Math.max(0, p.discountValue ?? 0)
          off = Math.min(per * l.qty, lineTotal)
          label = `-฿${per}`
        }
        if (off > 0) addLineDiscount(lineDiscounts, l.key, off, label)
      }
    } else if (p.type === 'bundle') {
      const buyQty = Math.max(1, Math.floor(p.buyQty ?? 0))
      const bundlePrice = Math.max(0, p.bundlePrice ?? 0)
      if (buyQty < 2 || !p.targetId) continue
      // Apply per line of the exact target item (uses that line's unit price, so
      // variants price correctly). Multiple lines of the same item each bundle.
      for (const l of lines) {
        if (l.menuId !== p.targetId) continue
        const bundles = Math.floor(l.qty / buyQty)
        if (bundles <= 0) continue
        const normalCost = bundles * buyQty * l.unitPrice
        const off = Math.max(0, normalCost - bundles * bundlePrice)
        if (off > 0) addLineDiscount(lineDiscounts, l.key, off, `${buyQty} for ฿${bundlePrice}`)
      }
    } else if (p.type === 'free_item') {
      const buyQty = Math.max(1, Math.floor(p.buyQty ?? 0))
      if (!p.targetId || !p.freeText) continue
      const have = qtyByMenu.get(p.targetId) ?? 0
      const times = Math.floor(have / buyQty)
      if (times > 0) freebies.push({ promoId: p.id, text: p.freeText, qty: times })
    }
  }

  for (const k in lineDiscounts) totalDiscount += lineDiscounts[k].amount
  return { lineDiscounts, freebies, totalDiscount }
}

function addLineDiscount(map: Record<string, LinePromo>, key: string, amount: number, label: string) {
  const existing = map[key]
  if (existing) {
    // A line matched by more than one promo — stack the discount, join labels.
    map[key] = { amount: existing.amount + amount, label: `${existing.label} ${label}` }
  } else {
    map[key] = { amount, label }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

// ─── Display helper for the QR promo popup / management list ───────────────────

export function promotionSummary(p: Promotion): string {
  if (p.type === 'bundle') return `${p.buyQty} for ฿${p.bundlePrice}`
  if (p.type === 'free_item') return `Buy ${p.buyQty} → ${p.freeText}`
  // discount
  const v = p.discountType === 'percent' ? `${p.discountValue}%` : `฿${p.discountValue}`
  return `${v} off`
}
