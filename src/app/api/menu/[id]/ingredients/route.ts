export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getMenuIngredients, upsertMenuIngredients } from '@/lib/store'
import { requireStaff } from '@/lib/api-auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.res
  const { id } = await params
  try {
    const ingredients = await getMenuIngredients(id)
    return NextResponse.json({ ingredients })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch ingredients' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.res
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
