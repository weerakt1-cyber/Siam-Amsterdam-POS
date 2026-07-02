export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getMenuIngredients, upsertMenuIngredients } from '@/lib/store'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const ingredients = await getMenuIngredients(id)
    return NextResponse.json({ ingredients })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch ingredients' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { ingredients } = await req.json()
    if (!Array.isArray(ingredients)) {
      return NextResponse.json({ error: 'ingredients must be an array' }, { status: 400 })
    }
    const saved = await upsertMenuIngredients(id, ingredients)
    return NextResponse.json({ ingredients: saved })
  } catch {
    return NextResponse.json({ error: 'Failed to save ingredients' }, { status: 500 })
  }
}
