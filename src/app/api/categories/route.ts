export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCategories, saveCategories } from '@/lib/store'

export async function GET() {
  try {
    const categories = await getCategories()
    return NextResponse.json({ categories })
  } catch (err) {
    console.error('[categories] GET failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ categories: [], error: 'Failed to load categories' }, { status: 500 })
  }
}

// Full-replace — body.categories is the complete, ordered list.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const categories = Array.isArray(body.categories) ? body.categories : []
    const saved = await saveCategories(categories)
    return NextResponse.json({ categories: saved })
  } catch (err) {
    console.error('[categories] POST failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to save categories' }, { status: 500 })
  }
}
