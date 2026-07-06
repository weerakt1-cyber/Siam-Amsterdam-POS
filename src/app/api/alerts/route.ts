export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getOrders, getInventory, getMenu, getAllMenuIngredients } from '@/lib/store'
import { computeAlerts } from '@/lib/alerts'

// GET /api/alerts?daily=&weekly=&monthly=
// Targets come from the client's local BarSettings (localStorage) and are passed
// through as query params; 0 / absent disables that target's alert.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const num = (k: string) => Math.max(0, Number(searchParams.get(k) ?? 0) || 0)

  try {
    const [orders, inventory, menu, ingredients] = await Promise.all([
      getOrders(),
      getInventory(),
      getMenu(),
      // Ingredient links power the sales-velocity / variance suggestions but are
      // optional — if the table isn't provisioned, degrade gracefully to stock +
      // target alerts rather than failing the whole endpoint.
      getAllMenuIngredients().catch(() => []),
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
    })

    return NextResponse.json({ alerts })
  } catch (err) {
    console.error('[alerts] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ alerts: [], error: 'Failed to compute alerts' }, { status: 500 })
  }
}
