export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCategories, saveCategories } from '@/lib/store'
import { resolveStoreId } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const storeId = await resolveStoreId(req)
    if (!storeId) return NextResponse.json({ categories: [], error: 'Store context required' }, { status: 400 })
    const categories = await getCategories(storeId)
    return NextResponse.json({ categories })
  } catch (err) {
    console.error('[categories] GET failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ categories: [], error: 'Failed to load categories' }, { status: 500 })
  }
}

// Full-replace — body.categories is the complete, ordered list.
export async function POST(req: NextRequest) {
  try {
    const storeId = await resolveStoreId(req)
    if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
    const body = await req.json()
    const categories = Array.isArray(body.categories) ? body.categories : []
    const saved = await saveCategories(categories, storeId)
    return NextResponse.json({ categories: saved })
  } catch (err) {
    console.error('[categories] POST failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to save categories' }, { status: 500 })
  }
}
