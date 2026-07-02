export const dynamic = "force-dynamic"

import { NextResponse } from 'next/server'
import { getAllMenuIngredients } from '@/lib/store'

export async function GET() {
  try {
    const ingredients = await getAllMenuIngredients()
    return NextResponse.json({ ingredients })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch ingredients' }, { status: 500 })
  }
}
