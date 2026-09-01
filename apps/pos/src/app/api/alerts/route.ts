export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getOrders, getInventory, getMenu, getAllMenuIngredients, getRecentVerifiedSlips } from '@/lib/store'
import { resolveStaffStoreId } from '@/lib/api-auth'
import { computeAlerts } from '@/lib/alerts'

// GET /api/alerts?daily=&weekly=&monthly=
// Targets come from the client's local BarSettings (localStorage) and are passed
// through as query params; 0 / absent disables that target's alert.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const num = (k: string) => Math.max(0, Number(searchParams.get(k) ?? 0) || 0)

  try {
    const storeId = await resolveStaffStoreId(req)
    if (!storeId) return NextResponse.json({ alerts: [], error: 'Authentication required' }, { status: 401 })
    // Verified transfer slips in the last 10 min drive the cross-device "money
    // in" ping; optional, so a missing/unprovisioned slips table degrades to the
    // other alerts rather than failing the endpoint.
    const slipsSinceIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const [orders, inventory, menu, ingredients, slips] = await Promise.all([
      // Alerts need ~60 days of sales velocity — bound the query to that window
      // (it was already filtered to 60 days in-memory below).
      getOrders(storeId, { sinceDays: 60 }),
      getInventory(storeId),
      getMenu(storeId),
      // Ingredient links power the sales-velocity / variance suggestions but are
      // optional — if the table isn't provisioned, degrade gracefully to stock +
      // target alerts rather than failing the whole endpoint.
      getAllMenuIngredients().catch(() => []),
      getRecentVerifiedSlips(slipsSinceIso, storeId).catch(() => []),
    ])

    // Bound the order set to ~60 days to keep computation light.
    const cutoff = Date.now() - 60 * 86400000
    const recent = orders.filter(o => new Date(o.createdAt).getTime() >= cutoff)

    const alerts = computeAlerts({
      orders: recent,
      inventory,
      menu,
      ingredients,
      targets: { daily: num('daily'), weekly: num('weekly'), monthly: num('monthly') },
      now: Date.now(),
      slips: slips.map(s => ({ id: s.id, orderId: s.orderId, amount: s.amount, verifiedAt: s.verifiedAt })),
    })

    return NextResponse.json({ alerts })
  } catch (err) {
    console.error('[alerts] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ alerts: [], error: 'Failed to compute alerts' }, { status: 500 })
  }
}
