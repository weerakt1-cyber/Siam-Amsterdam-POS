export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { requireStaff, resolveStaffStoreId } from '@/lib/api-auth'
import { checkAiAllowed, debitAiCredit } from '@/lib/store'
import { AI_NAME, AI_MODEL } from '@/lib/ai-brand'

// The assistant answers in the POS UI language. Everything the user sees —
// error copy, the context the model reads, and its output instruction — is
// picked by `lang` so an English-mode POS never surfaces Thai.
type Lang = 'en' | 'th'
const pick = (lang: Lang, en: string, th: string) => (lang === 'en' ? en : th)
function reqLang(req: NextRequest): Lang {
  return new URL(req.url).searchParams.get('lang') === 'en' ? 'en' : 'th'
}
const localeOf = (lang: Lang) => (lang === 'en' ? 'en-US' : 'th-TH')

// AI add-on gate messages (Phase 1.5) — keyed by checkAiAllowed reason.
const AI_BLOCK_MSG: Record<string, { en: string; th: string }> = {
  no_subscription: { en: 'AI add-on not subscribed — open the Packages page to enable it', th: 'ยังไม่ได้สมัคร AI add-on — ไปที่หน้าแพ็คเกจเพื่อเปิดใช้งาน' },
  expired:         { en: 'AI add-on has expired — please renew', th: 'AI add-on หมดอายุแล้ว — กรุณาต่ออายุ' },
  no_credit:       { en: 'AI credit used up — top up or wait for the reset', th: 'เครดิต AI หมดแล้ว — เติมเครดิตหรือรอรอบรีเซ็ต' },
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ─── Plan config ──────────────────────────────────────────────────────────────

const PLAN_MONTHS: Record<string, number> = {
  starter:    18,
  pro:        60,
  enterprise: 9999,
}

// ─── Business context from Supabase ──────────────────────────────────────────

async function buildBusinessContext(storeId: string, lang: Lang): Promise<string> {
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
    supabase.from('orders').select('*').eq('store_id', storeId).gte('created_at', todayStart.toISOString()),
    supabase.from('orders').select('*').eq('store_id', storeId).in('status', ['pending', 'accepted', 'ready', 'delivered']).order('created_at', { ascending: false }),
    supabase.from('menu_items').select('id,name,name_th,price,category,available').eq('store_id', storeId).eq('available', true).order('sort_order', { ascending: true }),
    supabase.from('members').select('*', { count: 'exact', head: true }).eq('store_id', storeId),
    supabase.from('inventory_items').select('name,unit,current_stock,low_stock_threshold').eq('store_id', storeId),
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

  const loc = localeOf(lang)
  const dateStr = now.toLocaleDateString(loc, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })

  return `${pick(lang, 'Business snapshot at', 'ข้อมูลธุรกิจ ณ')} ${dateStr} ${pick(lang, 'at', 'เวลา')} ${timeStr}

## ${pick(lang, "Today's sales", 'ยอดขายวันนี้')}
- ${pick(lang, 'Paid orders', 'ออเดอร์ที่ชำระแล้ว')}: ${paid.length}
- ${pick(lang, 'Total revenue', 'รายได้รวม')}: ฿${todayRevenue.toLocaleString(loc)}
${topItems.length > 0 ? `- ${pick(lang, 'Best sellers today', 'สินค้าขายดีวันนี้')}:\n${topItems.map(i => `  • ${i.name}: ${i.qty}${pick(lang, ' sold', ' ชิ้น')} (฿${i.revenue.toLocaleString()})`).join('\n')}` : `- ${pick(lang, 'No sales yet', 'ยังไม่มียอดขาย')}`}

## ${pick(lang, 'Open tables', 'โต๊ะที่เปิดอยู่')} (${openTables.length})
${openTables.length > 0 ? openTables.map(t => `- ${pick(lang, 'Table', 'โต๊ะ')} ${t.tableNo}: ${t.status} | ${t.items}${pick(lang, ' items', ' รายการ')} | ฿${t.total.toLocaleString()}`).join('\n') : pick(lang, 'No tables open right now', 'ไม่มีโต๊ะที่เปิดอยู่ขณะนี้')}

## ${pick(lang, 'Available menu', 'เมนูที่มีบริการ')} (${(menuItems ?? []).length})
${(menuItems ?? []).map(m => `- ${m.name}${m.name_th ? ` / ${m.name_th}` : ''}: ฿${m.price} [${m.category}]`).join('\n')}

## ${pick(lang, 'Members', 'สมาชิก')}
- ${pick(lang, 'Total members', 'จำนวนสมาชิกทั้งหมด')}: ${memberCount ?? 0}

## ${pick(lang, 'Low stock', 'สินค้าคงคลังใกล้หมด')} (${lowStock.length})
${lowStock.length > 0 ? lowStock.map(i => `- ${i.name}: ${i.current_stock} ${i.unit} (${pick(lang, 'min', 'เกณฑ์')} ${i.low_stock_threshold})`).join('\n') : pick(lang, 'Nothing running low', 'ไม่มีสินค้าใกล้หมด')}`
}

// ─── File context builder ─────────────────────────────────────────────────────

function buildFileContext(
  file: { name: string; ext: string; content: string },
  plan: string,
  lang: Lang,
): string {
  const months = PLAN_MONTHS[plan] ?? 18
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffStr = months >= 9999
    ? pick(lang, 'unlimited', 'ไม่จำกัด')
    : cutoff.toLocaleDateString(localeOf(lang), { year: 'numeric', month: 'long', day: 'numeric' })

  // Limit content length based on plan to control token usage
  const maxChars = plan === 'enterprise' ? 60_000 : plan === 'pro' ? 35_000 : 18_000
  const content = file.content.length > maxChars
    ? file.content.slice(0, maxChars) + pick(lang, '\n... [content truncated — file exceeds the plan limit]', '\n... [เนื้อหาถูกตัดเนื่องจากขนาดไฟล์เกิน limit ของ plan]')
    : file.content

  if (lang === 'en') {
    return `
---
## Attached file: "${file.name}" (${file.ext.toUpperCase()})

**Plan: ${plan.toUpperCase()}** — imports data going back ${months >= 9999 ? 'without limit' : `${months} months`} (from ${cutoffStr} to now)
Rows dated earlier than ${cutoffStr} are filtered out before import

File content:
\`\`\`
${content}
\`\`\`

## File analysis instructions
1. Analyse the file structure (columns, data format, row count)
2. Identify which system table it maps to (orders, menu_items, members, inventory_items)
3. Show the first 3–5 rows as a preview to confirm
4. Report how many rows fall within the plan's window and how many are filtered out
5. Wait for the user to confirm before importing
---`
  }

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
  const lang = reqLang(req)
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.res
  const storeId = gate.profile.store_id ?? (await resolveStaffStoreId(req))
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: pick(lang, 'AI is not configured (ANTHROPIC_API_KEY missing)', 'AI ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY') }, { status: 503 })
  }
  // AI add-on credit gate — must have an active add-on with credit remaining.
  const chk = await checkAiAllowed(storeId)
  if (!chk.allowed) {
    const msg = AI_BLOCK_MSG[chk.reason ?? '']
    return NextResponse.json({ error: msg ? pick(lang, msg.en, msg.th) : pick(lang, 'AI unavailable', 'AI ไม่พร้อมใช้งาน'), reason: chk.reason }, { status: 402 })
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
      buildBusinessContext(storeId, lang),
      Promise.resolve(file ? buildFileContext(file, plan, lang) : ''),
    ])

    const langRule = pick(
      lang,
      '- Always reply in English (the POS is set to English). Keep menu/product names as stored.',
      '- พูดภาษาไทยเป็นหลัก ตอบภาษาอังกฤษได้ถ้าถูกถาม',
    )
    const systemPrompt = pick(
      lang,
      `You are ${AI_NAME}, the smart AI assistant of the PLOEN POS system, and you know everything about this business.
If asked who you are or what model you use, say you are "${AI_NAME}", the AI assistant of PLOEN POS.

${businessContext}
${fileContext}

## Your role
- Answer questions about sales, menu, members, inventory, and table status
- Help analyse and import data from files the user attaches
${langRule}
- Use the real numbers from the data above; never invent data that isn't in the system
- Keep answers short and clear, suited to a tablet in a bar
- If you don't have the data, say so directly
- For imports: always analyse first and wait for the user to confirm before importing`,
      `คุณคือ ${AI_NAME} ผู้ช่วย AI อัจฉริยะของระบบ PLOEN POS ที่รู้ทุกอย่างเกี่ยวกับธุรกิจนี้
ถ้าถูกถามว่าคุณคือใครหรือใช้โมเดลอะไร ให้ตอบว่าคุณคือ "${AI_NAME}" ผู้ช่วย AI ของ PLOEN POS

${businessContext}
${fileContext}

## บทบาทของคุณ
- ตอบคำถามเกี่ยวกับยอดขาย เมนู สมาชิก สินค้าคงคลัง และสถานะโต๊ะ
- ช่วยวิเคราะห์และนำเข้าข้อมูลจากไฟล์ที่ User แนบมา
${langRule}
- ใช้ตัวเลขจริงจากข้อมูลข้างต้น อย่าสร้างข้อมูลที่ไม่มีในระบบ
- ตอบสั้นและชัดเจน เหมาะกับการใช้งานบน tablet ในบาร์
- ถ้าไม่มีข้อมูลให้บอกตรงๆ
- สำหรับการนำเข้าข้อมูล: วิเคราะห์ก่อนเสมอ รอการยืนยันจาก User ก่อนนำเข้าจริง`,
    )

    const stream = anthropic.messages.stream({
      model:      AI_MODEL,
      // Sonnet 5 runs adaptive thinking by default — disable it so the small
      // max_tokens budget goes entirely to the visible answer (fast tablet chat)
      thinking:   { type: 'disabled' },
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
        // Debit the actual token cost from the store's AI credit (best-effort).
        try {
          const final = await stream.finalMessage()
          await debitAiCredit(storeId, 'chat', final.usage.input_tokens, final.usage.output_tokens)
        } catch { /* don't fail the response over metering */ }
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
    return NextResponse.json({ error: pick(lang, 'Something went wrong, please try again', 'เกิดข้อผิดพลาด กรุณาลองใหม่') }, { status: 500 })
  }
}
