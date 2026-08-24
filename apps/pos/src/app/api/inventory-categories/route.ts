export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getConfig, setConfig } from '@/lib/store'
import { resolveStaffStoreId } from '@/lib/api-auth'

const CONFIG_KEY = 'inventory_categories'

type InvCat = { value: string; label: string }

export async function GET(req: NextRequest) {
  try {
    const storeId = await resolveStaffStoreId(req)
    if (!storeId) return NextResponse.json({ categories: [], error: 'Authentication required' }, { status: 401 })
    const raw = await getConfig(CONFIG_KEY, storeId)
    const categories: InvCat[] = raw ? JSON.parse(raw) : []
    return NextResponse.json({ categories: Array.isArray(categories) ? categories : [] })
  } catch (err) {
    console.error('[inventory-categories] GET failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ categories: [], error: 'Failed to load inventory categories' }, { status: 500 })
  }
}

// Full-replace — body.categories is the complete list.
export async function POST(req: NextRequest) {
  try {
    const storeId = await resolveStaffStoreId(req)
    if (!storeId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const body = await req.json()
    const categories: InvCat[] = Array.isArray(body.categories)
      ? body.categories
          .filter((c: unknown): c is InvCat => !!c && typeof (c as InvCat).value === 'string' && typeof (c as InvCat).label === 'string')
          .map((c: InvCat) => ({ value: c.value, label: c.label }))
      : []
    await setConfig(CONFIG_KEY, JSON.stringify(categories), storeId)
    return NextResponse.json({ categories })
  } catch (err) {
    console.error('[inventory-categories] POST failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to save inventory categories' }, { status: 500 })
  }
}
