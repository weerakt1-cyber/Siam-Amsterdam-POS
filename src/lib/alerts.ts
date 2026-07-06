// Business alert engine — pure functions that turn raw POS data into a ranked list
// of actionable notifications (low stock, revenue targets, restock suggestions,
// stock-vs-sales variance). No I/O here so it's trivially testable; the /api/alerts
// route gathers the data and calls computeAlerts().

import type { Order, InventoryItem, MenuItem, MenuIngredient } from './types'

export type AlertSeverity = 'critical' | 'warning' | 'info' | 'success'
export type AlertCategory = 'stock' | 'target' | 'suggestion' | 'variance'

export type Alert = {
  id:       string          // stable — used for de-dup + "seen" tracking on the client
  severity: AlertSeverity
  category: AlertCategory
  icon:     string
  title:    string
  detail:   string
}

export type AlertTargets = {
  daily:   number  // 0 = disabled
  weekly:  number
  monthly: number
}

export type AlertInput = {
  orders:      Order[]           // recent paid orders (server passes ~60 days)
  inventory:   InventoryItem[]
  menu:        MenuItem[]
  ingredients: MenuIngredient[]
  targets:     AlertTargets
  now:         number            // Date.now() passed in for testability
}

const BKK_MS = 7 * 60 * 60 * 1000
const baht = (n: number) => '฿' + Math.round(n).toLocaleString()

// Severity ordering for the final ranked list (most urgent first).
const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2, success: 3 }

// ── BKK calendar-period helpers ────────────────────────────────────────────────

function bkk(now: number): Date {
  return new Date(now + BKK_MS)
}

// UTC epoch ms for the start of today / this week (Mon) / this month, in BKK time.
function periodStarts(now: number) {
  const d = bkk(now)
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate()
  const dow = d.getUTCDay() // 0=Sun..6=Sat

  const dayStart = Date.UTC(y, m, day) - BKK_MS
  // Monday-based week
  const daysSinceMon = (dow + 6) % 7
  const weekStart = Date.UTC(y, m, day - daysSinceMon) - BKK_MS
  const monthStart = Date.UTC(y, m, 1) - BKK_MS
  return { dayStart, weekStart, monthStart }
}

function revenueSince(orders: Order[], sinceMs: number): number {
  return orders.reduce((s, o) => {
    if (o.status !== 'paid') return s
    return new Date(o.createdAt).getTime() >= sinceMs ? s + o.total : s
  }, 0)
}

// ── Main ────────────────────────────────────────────────────────────────────────

export function computeAlerts(input: AlertInput): Alert[] {
  const { orders, inventory, menu, ingredients, targets, now } = input
  const alerts: Alert[] = []
  const paidOrders = orders.filter(o => o.status === 'paid')

  // menuId → display name (for suggestion messages)
  const menuName = new Map(menu.map(m => [m.id, m.name]))

  // ── 1. Stock levels ───────────────────────────────────────────────────────
  for (const it of inventory) {
    if (it.currentStock <= 0) {
      alerts.push({
        id: `stock-out-${it.id}`, severity: 'critical', category: 'stock', icon: '🚫',
        title: `Out of stock: ${it.name}`,
        detail: `${it.name} is at 0 ${it.unit}. Restock before it blocks sales.`,
      })
    } else if (it.currentStock <= it.lowStockThreshold) {
      alerts.push({
        id: `stock-low-${it.id}`, severity: 'warning', category: 'stock', icon: '📉',
        title: `Low stock: ${it.name}`,
        detail: `${it.currentStock} ${it.unit} left (alert at ${it.lowStockThreshold}). Time to reorder.`,
      })
    }
  }

  // ── 2. Revenue targets (BKK calendar day / week / month) ──────────────────
  const { dayStart, weekStart, monthStart } = periodStarts(now)
  const targetChecks: { key: string; label: string; start: number; target: number }[] = [
    { key: 'daily',   label: "Today's",  start: dayStart,   target: targets.daily },
    { key: 'weekly',  label: "This week's",  start: weekStart,  target: targets.weekly },
    { key: 'monthly', label: "This month's", start: monthStart, target: targets.monthly },
  ]
  for (const t of targetChecks) {
    if (t.target <= 0) continue
    const rev = revenueSince(paidOrders, t.start)
    const pct = Math.round((rev / t.target) * 100)
    if (rev >= t.target) {
      alerts.push({
        id: `target-${t.key}`, severity: 'success', category: 'target', icon: '🎯',
        title: `${t.label} target hit! ${pct}%`,
        detail: `${baht(rev)} of ${baht(t.target)} — great work. 🎉`,
      })
    } else if (pct >= 80) {
      alerts.push({
        id: `target-${t.key}`, severity: 'info', category: 'target', icon: '🔥',
        title: `${t.label} target ${pct}% — almost there`,
        detail: `${baht(rev)} of ${baht(t.target)}, only ${baht(t.target - rev)} to go.`,
      })
    }
  }

  // ── 3 & 4. Sales-velocity suggestions + stock/sales variance ──────────────
  // Build per-inventory-item: 30d consumption (from linked menu sales) and
  // consumption since the item's stock was last updated (variance signal).
  const cutoff30 = now - 30 * 86400000

  // Pre-aggregate menu-item sales: 30d total qty, plus a timestamped list for the
  // "since last stock update" variance window.
  const soldQty30   = new Map<string, number>()
  const salesByMenu = new Map<string, { t: number; qty: number }[]>()
  for (const o of paidOrders) {
    const t = new Date(o.createdAt).getTime()
    for (const li of o.items) {
      if (t >= cutoff30) soldQty30.set(li.menuId, (soldQty30.get(li.menuId) ?? 0) + li.qty)
      const arr = salesByMenu.get(li.menuId) ?? []
      arr.push({ t, qty: li.qty })
      salesByMenu.set(li.menuId, arr)
    }
  }

  // inventoryItemId → its ingredient links
  const linksByInv = new Map<string, MenuIngredient[]>()
  for (const ing of ingredients) {
    const arr = linksByInv.get(ing.inventoryItemId) ?? []
    arr.push(ing)
    linksByInv.set(ing.inventoryItemId, arr)
  }

  for (const it of inventory) {
    const links = linksByInv.get(it.id)
    if (!links || links.length === 0) continue // no menu link → can't infer velocity

    // 30-day consumption of this inventory item across all linked menu items.
    let consumed30 = 0
    let consumedSinceUpdate = 0
    const updatedMs = new Date(it.updatedAt).getTime()
    for (const link of links) {
      const qty30 = soldQty30.get(link.menuItemId) ?? 0
      consumed30 += qty30 * link.quantityPerServing
      for (const s of salesByMenu.get(link.menuItemId) ?? []) {
        if (s.t > updatedMs) consumedSinceUpdate += s.qty * link.quantityPerServing
      }
    }

    // 3a. Top seller running low — high velocity + few days of cover left.
    if (consumed30 > 0 && it.currentStock > 0) {
      const perDay = consumed30 / 30
      const daysLeft = perDay > 0 ? it.currentStock / perDay : Infinity
      if (daysLeft < 7 && it.currentStock > it.lowStockThreshold) {
        alerts.push({
          id: `restock-${it.id}`, severity: 'info', category: 'suggestion', icon: '📈',
          title: `Stock up: ${it.name} selling fast`,
          detail: `~${Math.round(consumed30)} ${it.unit} used in 30 days · about ${Math.floor(daysLeft)} day${Math.floor(daysLeft) === 1 ? '' : 's'} of cover left. Order more.`,
        })
      }
    }

    // 3b. Slow mover / overstock — no sales but plenty of stock sitting.
    if (consumed30 === 0 && it.currentStock > it.lowStockThreshold * 2) {
      const topLink = links[0]
      const name = menuName.get(topLink.menuItemId)
      alerts.push({
        id: `overstock-${it.id}`, severity: 'info', category: 'suggestion', icon: '🐌',
        title: `Slow mover: ${it.name}`,
        detail: `${it.currentStock} ${it.unit} in stock but no sales in 30 days${name ? ` (used in ${name})` : ''}. Consider ordering less.`,
      })
    }

    // 4. Stock vs sales variance — recorded stock hasn't been reconciled with sales.
    // e.g. system still shows 8 but ~2 servings sold since last update → expect ~6.
    const expected = it.currentStock - consumedSinceUpdate
    if (consumedSinceUpdate >= 2 && consumedSinceUpdate >= it.currentStock * 0.15) {
      alerts.push({
        id: `variance-${it.id}`, severity: 'warning', category: 'variance', icon: '⚖️',
        title: `Recount ${it.name}?`,
        detail: `System shows ${it.currentStock} ${it.unit}, but ~${Math.round(consumedSinceUpdate)} sold since last update — expected ~${Math.max(0, Math.round(expected))}. Do a physical count.`,
      })
    }
  }

  // Rank: severity first, then category grouping stability.
  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}
