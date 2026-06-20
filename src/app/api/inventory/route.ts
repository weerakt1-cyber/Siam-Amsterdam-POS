import { NextRequest, NextResponse } from 'next/server'
import { getInventory, createInventoryItem } from '@/lib/store'

export async function GET() {
  const items = await getInventory()
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, unit, category, currentStock, lowStockThreshold, costPerUnit, notes } = body

    if (!name || typeof name !== 'string' || name.trim() === '')
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    if (!unit || !category)
      return NextResponse.json({ error: 'unit and category are required' }, { status: 400 })

    const item = await createInventoryItem({
      name:               name.trim(),
      unit,
      category,
      currentStock:       Number(currentStock) || 0,
      lowStockThreshold:  Number(lowStockThreshold) || 5,
      costPerUnit:        costPerUnit ? Number(costPerUnit) : undefined,
      notes:              notes || undefined,
    })
    return NextResponse.json({ item }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
