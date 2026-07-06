export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ─── Plan config ──────────────────────────────────────────────────────────────

const PLAN_MONTHS: Record<string, number> = {
  starter:    18,
  pro:        60,
  enterprise: 9999,
}

// ─── Business context from Supabase ──────────────────────────────────────────

async function buildBusinessContext(): Promise<string> {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const [
    { data: todayOrders },
    { data: openOrders },
    { data: menuItems },
    { count: memberCount },
    { data: inventory },
  ] = await Promise.all([
    supabase.from('orders').select('*').gte('created_at', todayStart.toISOString()),
    supabase.from('orders').select('*').in('status', ['pending', 'accepted', 'ready', 'delivered']).order('created_at', { ascending: false }),
    supabase.from('menu_items').select('id,name,name_th,price,category,available').eq('available', true).order('sort_order', { ascending: true }),
    supabase.from('members').select('*', { count: 'exact', head: true }),
    supabase.from('inventory_items').select('name,unit,current_stock,low_stock_threshold'),
  ])

  const paid = (todayOrders ?? []).filter(o => o.status === 'paid')
  const todayRevenue = paid.reduce((s, o) => s + Number(o.total), 0)

  const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {}
  for (const order of paid) {
    for (const item of (order.order_items ?? []) as { name: string; qty: number; price: number }[]) {
      if (!itemMap[item.name]) itemMap[item.name] = { name: item.name, qty: 0, revenue: 0 }
      itemMap[item.name].qty += item.qty
      itemMap[item.name].revenue += item.qty * item.price
    }
  }
  const topItems = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 8)

  const seen = new Set<string>()
  const openTables = (openOrders ?? []).filter(o => {
    if (seen.has(o.table_no)) return false
    seen.add(o.table_no); return true
  }).map(o => ({ tableNo: o.table_no, status: o.status, total: Number(o.total), items: (o.order_items ?? []).length }))

  const lowStock = (inventory ?? []).filter(i => Number(i.current_stock) <= Number(i.low_stock_threshold))

  const dateStr = now.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

  return `ข้อมูลธุรกิจ ณ ${dateStr} เวลา ${timeStr}

## ยอดขายวันนี้
- ออเดอร์ที่ชำระแล้ว: ${paid.length} ออเดอร์
- รายได้รวม: ฿${todayRevenue.toLocaleString('th-TH')}
${topItems.length > 0 ? `- สินค้าขายดีวันนี้:\n${topItems.map(i => `  • ${i.name}: ${i.qty} ชิ้น (฿${i.revenue.toLocaleString()})`).join('\n')}` : '- ยังไม่มียอดขาย'}

## โต๊ะที่เปิดอยู่ (${openTables.length} โต๊ะ)
${openTables.length > 0 ? openTables.map(t => `- โต๊ะ ${t.tableNo}: ${t.status} | ${t.items} รายการ | ฿${t.total.toLocaleString()}`).join('\n') : 'ไม่มีโต๊ะที่เปิดอยู่ขณะนี้'}

## เมนูที่มีบริการ (${(menuItems ?? []).length} รายการ)
${(menuItems ?? []).map(m => `- ${m.name}${m.name_th ? ` / ${m.name_th}` : ''}: ฿${m.price} [${m.category}]`).join('\n')}

## สมาชิก
- จำนวนสมาชิกทั้งหมด: ${memberCount ?? 0} คน

## สินค้าคงคลังใกล้หมด (${lowStock.length} รายการ)
${lowStock.length > 0 ? lowStock.map(i => `- ${i.name}: ${i.current_stock} ${i.unit} (เกณฑ์ ${i.low_stock_threshold})`).join('\n') : 'ไม่มีสินค้าใกล้หมด'}`
}

// ─── File context builder ─────────────────────────────────────────────────────

function buildFileContext(
  file: { name: string; ext: string; content: string },
  plan: string,
): string {
  const months = PLAN_MONTHS[plan] ?? 18
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffStr = months >= 9999
    ? 'ไม่จำกัด'
    : cutoff.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })

  // Limit content length based on plan to control token usage
  const maxChars = plan === 'enterprise' ? 60_000 : plan === 'pro' ? 35_000 : 18_000
  const content = file.content.length > maxChars
    ? file.content.slice(0, maxChars) + '\n... [เนื้อหาถูกตัดเนื่องจากขนาดไฟล์เกิน limit ของ plan]'
    : file.content

  return `
---
## ไฟล์ที่แนบมา: "${file.name}" (${file.ext.toUpperCase()})

**Plan: ${plan.toUpperCase()}** — นำเข้าข้อมูลได้ย้อนหลัง${months >= 9999 ? 'ไม่จำกัด' : ` ${months} เดือน`} (ตั้งแต่ ${cutoffStr} จนถึงปัจจุบัน)
ข้อมูลที่มีวันที่เก่ากว่า ${cutoffStr} จะถูกกรองออกก่อนนำเข้า

เนื้อหาไฟล์:
\`\`\`
${content}
\`\`\`

## คำแนะนำสำหรับการวิเคราะห์ไฟล์
1. วิเคราะห์โครงสร้างของไฟล์ (คอลัมน์, รูปแบบข้อมูล, จำนวนแถว)
2. ระบุว่าข้อมูลนี้ตรงกับตารางใดในระบบ (orders, menu_items, members, inventory_items)
3. แสดงตัวอย่างข้อมูล 3-5 แถวแรกเพื่อยืนยัน
4. แจ้งจำนวนแถวที่สามารถนำเข้าได้ภายในช่วงเวลาของ plan และจำนวนที่จะถูกกรองออก
5. รอการยืนยันจาก User ก่อนดำเนินการนำเข้าข้อมูล
---`
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY' }, { status: 503 })
  }

  let messages: { role: string; content: string }[]
  let file: { name: string; ext: string; content: string } | undefined
  let plan = 'starter'

  try {
    const body = await req.json()
    messages = body.messages
    file     = body.file
    plan     = body.plan ?? 'starter'
    if (!Array.isArray(messages) || messages.length === 0) throw new Error()
  } catch {
    return NextResponse.json({ error: 'messages required' }, { status: 400 })
  }

  try {
    const [businessContext, fileContext] = await Promise.all([
      buildBusinessContext(),
      Promise.resolve(file ? buildFileContext(file, plan) : ''),
    ])

    const systemPrompt = `คุณคือผู้ช่วย AI ของบาร์นี้ ที่รู้ทุกอย่างเกี่ยวกับธุรกิจนี้

${businessContext}
${fileContext}

## บทบาทของคุณ
- ตอบคำถามเกี่ยวกับยอดขาย เมนู สมาชิก สินค้าคงคลัง และสถานะโต๊ะ
- ช่วยวิเคราะห์และนำเข้าข้อมูลจากไฟล์ที่ User แนบมา
- พูดภาษาไทยเป็นหลัก ตอบภาษาอังกฤษได้ถ้าถูกถาม
- ใช้ตัวเลขจริงจากข้อมูลข้างต้น อย่าสร้างข้อมูลที่ไม่มีในระบบ
- ตอบสั้นและชัดเจน เหมาะกับการใช้งานบน tablet ในบาร์
- ถ้าไม่มีข้อมูลให้บอกตรงๆ
- สำหรับการนำเข้าข้อมูล: วิเคราะห์ก่อนเสมอ รอการยืนยันจาก User ก่อนนำเข้าจริง`

    const stream = anthropic.messages.stream({
      model:      'claude-sonnet-4-6',
      max_tokens: file ? 2048 : 1024,
      system:     systemPrompt,
      messages:   messages.map(m => ({
        role:    m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    const readable = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder()
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`))
            }
          }
        } catch {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: 'stream error' })}\n\n`))
        }
        controller.enqueue(enc.encode('data: [DONE]\n\n'))
        controller.close()
      },
      cancel() { stream.abort() },
    })

    return new Response(readable, {
      headers: {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      },
    })
  } catch (err) {
    console.error('[AI Chat]', err)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
