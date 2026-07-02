export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-auth'
import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const key = await validateApiKey(req)
  if (!key) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const from    = searchParams.get('from')    // ISO date string
  const to      = searchParams.get('to')
  const status  = searchParams.get('status')
  const page    = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const offset  = (page - 1) * PAGE_SIZE

  let query = supabase
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (from)   query = query.gte('created_at', from)
  if (to)     query = query.lte('created_at', to)
  if (status) query = query.eq('status', status)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const orders = (data ?? []).map(row => ({
    id:            row.id,
    tableNo:       row.table_no,
    status:        row.status,
    source:        row.source,
    total:         row.total,
    subtotal:      row.subtotal,
    discount:      row.discount,
    paymentMethod: row.payment_method,
    memberName:    row.member_name,
    note:          row.note,
    createdAt:     row.created_at,
    items: (row.order_items ?? []).map((i: Record<string, unknown>) => ({
      menuId:       i.menu_id,
      name:         i.name,
      qty:          i.qty,
      price:        i.price,
      variantLabel: i.variant_label,
    })),
  }))

  return NextResponse.json({
    orders,
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total:    count ?? 0,
      hasMore:  offset + PAGE_SIZE < (count ?? 0),
    },
  })
}
