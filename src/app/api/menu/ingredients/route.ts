export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getAllMenuIngredients } from '@/lib/store'
import { requireStaff } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.res
  try {
    const ingredients = await getAllMenuIngredients()
    return NextResponse.json({ ingredients })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch ingredients' }, { status: 500 })
  }
}
