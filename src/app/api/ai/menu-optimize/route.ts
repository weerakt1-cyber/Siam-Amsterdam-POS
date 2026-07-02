export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

type EnrichedItem = {
  id:          string
  name:        string
  price:       number
  cost:        number | null
  marginPct:   number | null
  category:    string
  soldQty30d:  number
  revenue30d:  number
}

type Suggestion = {
  menuId:         string
  currentPrice:   number
  suggestedPrice: number
  direction:      'up' | 'down' | 'bundle'
  reason:         string
  expectedImpact: string
}

export async function GET() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  // ── 1. Fetch menu items ──────────────────────────────────────────────────────
  const { data: menuRows, error: menuErr } = await supabase
    .from('menu_items')
    .select('id, name, price, cost, category, available')
    .eq('available', true)
    .order('category')

  if (menuErr) return NextResponse.json({ error: menuErr.message }, { status: 500 })

  // ── 2. Fetch last 30 days order items ────────────────────────────────────────
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const { data: orderItemRows, error: ordErr } = await supabase
    .from('order_items')
    .select('menu_id, qty, price, orders!inner(created_at, status)')
    .gte('orders.created_at', since.toISOString())
    .eq('orders.status', 'paid')

  if (ordErr) return NextResponse.json({ error: ordErr.message }, { status: 500 })

  // ── 3. Aggregate sales per menu_id ───────────────────────────────────────────
  const salesMap: Record<string, { qty: number; revenue: number }> = {}
  for (const row of orderItemRows ?? []) {
    if (!salesMap[row.menu_id]) salesMap[row.menu_id] = { qty: 0, revenue: 0 }
    salesMap[row.menu_id].qty     += Number(row.qty)
    salesMap[row.menu_id].revenue += Number(row.qty) * Number(row.price)
  }

  // ── 4. Build enriched items list ─────────────────────────────────────────────
  const enriched: EnrichedItem[] = (menuRows ?? []).map(m => {
    const price  = Number(m.price)
    const cost   = m.cost != null ? Number(m.cost) : null
    const margin = (cost != null && price > 0) ? Math.round(((price - cost) / price) * 100) : null
    const sales  = salesMap[m.id] ?? { qty: 0, revenue: 0 }
    return {
      id:         m.id,
      name:       m.name,
      price,
      cost,
      marginPct:  margin,
      category:   m.category,
      soldQty30d: sales.qty,
      revenue30d: Math.round(sales.revenue),
    }
  })

  // ── 5. Call Claude ────────────────────────────────────────────────────────────
  const prompt = `Here is the current menu data for a Bangkok bar (last 30 days of sales included):

${JSON.stringify(enriched, null, 2)}

Analyze this data and identify the top pricing opportunities. Consider:
- Items with high demand but low margin (raise price)
- Items with high margin but zero/low sales (lower price or bundle)
- Items with zero sales that should be bundled with popular items
- Typical Bangkok bar pricing norms (cocktails ฿180-350, shots ฿120-200, beer ฿120-180, food ฿80-250)
- Price elasticity: popular items can absorb small increases (5-15%), slow items need bigger cuts

Return ONLY a valid JSON object, no markdown, no explanation. The object must match this schema exactly:
{
  "suggestions": [
    {
      "menuId": "string",
      "currentPrice": number,
      "suggestedPrice": number,
      "direction": "up" | "down" | "bundle",
      "reason": "string (max 20 words)",
      "expectedImpact": "string (e.g. '+฿3,200/mo' or '+12% margin')"
    }
  ]
}

Provide 5-10 high-confidence suggestions. Only suggest changes where the data clearly supports it.`

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    system:     'You are a pricing strategist for a Bangkok bar. Identify pricing opportunities. Return only valid JSON.',
    messages:   [{ role: 'user', content: prompt }],
  })

  // ── 6. Parse response ─────────────────────────────────────────────────────────
  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  let suggestions: Suggestion[] = []
  try {
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
    const parsed  = JSON.parse(cleaned)
    suggestions   = Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  } catch {
    console.error('[menu-optimize] Failed to parse AI response:', raw)
    return NextResponse.json({ error: 'AI returned invalid JSON', raw }, { status: 500 })
  }

  // Attach item names for convenience
  const nameMap = Object.fromEntries((menuRows ?? []).map(m => [m.id, m.name]))
  const enrichedSuggestions = suggestions.map(s => ({
    ...s,
    itemName: nameMap[s.menuId] ?? s.menuId,
  }))

  return NextResponse.json({ suggestions: enrichedSuggestions, analyzedItems: enriched.length })
}
