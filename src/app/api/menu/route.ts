export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getMenu, createMenuItem } from '@/lib/store'
import type { MenuCategory } from '@/lib/types'

const VALID_CATEGORIES: MenuCategory[] = ['cocktail', 'beer', 'drink', 'snack', 'food', 'shot', 'other']

export async function GET() {
  const menu = await getMenu()
  return NextResponse.json({ menu })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, nameTh, price, category } = body

    if (!name || price === undefined) {
      return NextResponse.json({ error: 'name and price are required' }, { status: 400 })
    }

    // B-06: Enforce consistent category values
    if (category && !VALID_CATEGORIES.includes(category as MenuCategory)) {
      return NextResponse.json(
        { error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 }
      )
    }

    const item = await createMenuItem({
      name:        String(name),
      nameTh:      String(nameTh ?? ''),
      price:       Number(price),
      category:    (category as MenuCategory) ?? 'other',
      available:   body.available ?? true,
      cost:        body.cost != null ? Number(body.cost) : undefined,
      sku:         body.sku ? String(body.sku) : undefined,
      description: body.description ? String(body.description) : undefined,
      unit:        body.unit ? String(body.unit) : undefined,
      taxRate:     body.taxRate != null ? Number(body.taxRate) : undefined,
      image:       body.image ? String(body.image) : undefined,
      sortOrder:   body.sortOrder != null ? Number(body.sortOrder) : undefined,
      variants:    Array.isArray(body.variants) ? body.variants : [],
    })

    return NextResponse.json({ item }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
