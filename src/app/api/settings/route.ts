import { NextRequest, NextResponse } from 'next/server'
import { getConfigMany, setConfig } from '@/lib/store'
import { requireRole, resolveStoreId } from '@/lib/api-auth'

// Bar settings (shop name, receipt config, Google review URL, printer, …) and
// the floor layout (tables) used to live only in the browser's localStorage, so
// a reinstall or a new device lost them. They're now persisted server-side in
// app_config as JSON, with localStorage acting as a fast local cache.
const K_BAR   = 'bar_settings'
const K_FLOOR = 'floor_layout'

// GET — readable by any authenticated staff (shop name/tables aren't secret and
// are needed across the POS). Returns null for a key that was never saved.
export async function GET(req: NextRequest) {
  try {
    const storeId = await resolveStoreId(req)
    if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
    const cfg = await getConfigMany([K_BAR, K_FLOOR], storeId)
    return NextResponse.json({
      barSettings: cfg[K_BAR]   ? JSON.parse(cfg[K_BAR])   : null,
      floorTiles:  cfg[K_FLOOR] ? JSON.parse(cfg[K_FLOOR]) : null,
    })
  } catch (err) {
    console.error('[settings] GET', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

// POST — write-through from the client. Only admin/manager may change settings.
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ['admin', 'manager'])
  if (!gate.ok) return gate.res
  const storeId = gate.profile.store_id ?? (await resolveStoreId(req))
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  try {
    const body = await req.json()
    if (body.barSettings !== undefined) await setConfig(K_BAR, JSON.stringify(body.barSettings), storeId)
    if (body.floorTiles  !== undefined) await setConfig(K_FLOOR, JSON.stringify(body.floorTiles), storeId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[settings] POST', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
