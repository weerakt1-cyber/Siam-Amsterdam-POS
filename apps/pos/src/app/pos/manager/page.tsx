'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { authedFetch } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/pos-auth'
import { usePosLang, type PosLang } from '@/lib/pos-i18n'
import { loadBarSettings } from '@/lib/printer'
import { businessDayOf } from '@/lib/business-day'
import type { Order, InventoryItem } from '@/lib/types'

const baht = (n: number) => '฿' + Math.round(n).toLocaleString()
const pad = (n: number) => String(n).padStart(2, '0')
const clockOf = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const elapsed = (iso: string, lang: PosLang) => {
  const m = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000))
  return lang === 'en' ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${Math.floor(m / 60)}ชม. ${pad(m % 60)}น`
}

type ActiveShift = { staffId: string; name: string; color: string | null; clockIn: string; onBreak: boolean; breakType: 'meal' | 'restroom' | 'other' | null }
type Reservation = { id: string; customerName: string; reservedDate: string; startTime: string; endTime: string; partySize: number; status: string; note?: string }

const BREAK_EMOJI: Record<string, string> = { meal: '🍚', restroom: '🚻', other: '☕' }

export default function ManagerDashboard() {
  const { user } = useAuth()
  const { lang } = usePosLang()
  const L = (en: string, th: string) => (lang === 'en' ? en : th)
  const [orders, setOrders] = useState<Order[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [shifts, setShifts] = useState<ActiveShift[]>([])
  const [busyResv, setBusyResv] = useState<string | null>(null)

  const cutoff = loadBarSettings().businessDayCutoff
  const today = businessDayOf(new Date(), cutoff)
  const yesterday = businessDayOf(new Date(Date.now() - 86400000), cutoff)

  const load = useCallback(async () => {
    const [ro, ri, rr, rs] = await Promise.all([
      authedFetch('/api/orders'),
      authedFetch('/api/inventory'),
      authedFetch('/api/reservations'),
      authedFetch('/api/shifts/active'),
    ])
    if (ro.ok) setOrders((await ro.json()).orders ?? [])
    if (ri.ok) setInventory((await ri.json()).items ?? [])
    if (rr.ok) setReservations((await rr.json()).reservations ?? [])
    if (rs.ok) setShifts((await rs.json()).shifts ?? [])
  }, [])

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv) }, [load])

  async function decideResv(id: string, status: 'approved' | 'rejected') {
    setBusyResv(id)
    try {
      const r = await authedFetch(`/api/reservations/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      if (r.ok) setReservations(prev => prev.filter(x => x.id !== id))
    } finally { setBusyResv(null) }
  }

  // ── derive metrics ──
  const dayOrders = orders.filter(o => businessDayOf(o.createdAt, cutoff) === today && o.status !== 'cancelled')
  const paid = dayOrders.filter(o => o.status === 'paid')
  const revenue = paid.reduce((s, o) => s + o.total, 0)
  const orderCount = paid.length
  const avg = orderCount ? revenue / orderCount : 0
  const open = dayOrders.filter(o => o.status === 'pending')
  const openTables = new Set(open.map(o => o.tableNo)).size
  const unpaidTickets = open.length

  const yRevenue = orders.filter(o => businessDayOf(o.createdAt, cutoff) === yesterday && o.status === 'paid').reduce((s, o) => s + o.total, 0)
  const deltaPct = yRevenue > 0 ? Math.round(((revenue - yRevenue) / yRevenue) * 100) : null

  const lowStock = inventory
    .filter(i => i.currentStock <= i.lowStockThreshold)
    .sort((a, b) => a.currentStock - b.currentStock)
  const pendingResv = reservations.filter(r => r.status === 'pending')
    .sort((a, b) => (a.reservedDate + a.startTime).localeCompare(b.reservedDate + b.startTime))
  const onBreakCount = shifts.filter(s => s.onBreak).length

  const topItems = (() => {
    const m = new Map<string, { qty: number; total: number }>()
    for (const o of paid) for (const it of o.items) {
      const e = m.get(it.name) ?? { qty: 0, total: 0 }
      e.qty += it.qty; e.total += it.price * it.qty; m.set(it.name, e)
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 4)
  })()
  const topMax = topItems[0]?.qty ?? 1

  const initial = (user?.name ?? 'M').charAt(0).toUpperCase()

  return (
    <div className="flex-1 bg-[#FAF8F4] text-stone-900 overflow-y-auto">
      <div className="w-full max-w-md mx-auto px-4 pt-5 pb-24">

        {/* header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl grid place-items-center text-white font-black" style={{ background: user?.color || '#3b82f6' }}>{initial}</div>
          <div className="min-w-0">
            <p className="font-bold leading-tight truncate">{user?.name ?? '—'}</p>
            <p className="text-xs text-stone-500 mt-0.5">{L('Role', 'ตำแหน่ง')} <span className="text-blue-600 font-semibold">{L('Manager', 'ผู้จัดการ')}</span></p>
          </div>
        </div>

        {/* revenue hero */}
        <div className="rounded-3xl p-5 text-white relative overflow-hidden" style={{ background: 'linear-gradient(160deg,#1C1917,#292524)' }}>
          <p className="text-xs text-stone-300">{L("Today's sales", 'ยอดขายวันนี้')} · {new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <p className="text-4xl font-black mt-1 tabular-nums">฿<span className="text-amber-400">{Math.round(revenue).toLocaleString()}</span></p>
          <div className="flex gap-5 mt-3 text-[11px] text-stone-400">
            <div>{L('Orders', 'ออเดอร์')}<b className="block text-white text-[15px] font-bold tabular-nums">{orderCount}</b></div>
            <div>{L('Avg/bill', 'เฉลี่ย/บิล')}<b className="block text-white text-[15px] font-bold tabular-nums">{baht(avg)}</b></div>
            {deltaPct !== null && (
              <div>{L('vs yesterday', 'เทียบเมื่อวาน')}<b className={`block text-[15px] font-bold ${deltaPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct)}%</b></div>
            )}
          </div>
        </div>

        {/* 3-stat strip */}
        <div className="grid grid-cols-3 gap-2.5 mt-3">
          {[
            [L('Open tables', 'โต๊ะเปิดอยู่'), openTables, false],
            [L('Unpaid tickets', 'บิลค้างชำระ'), unpaidTickets, unpaidTickets > 0],
            [L('Staff on shift', 'พนักงานเข้ากะ'), shifts.length, false],
          ].map(([k, v, alert], i) => (
            <div key={i} className="bg-white border border-stone-200 rounded-2xl py-3 text-center">
              <p className={`font-black text-xl tabular-nums ${alert ? 'text-orange-500' : 'text-stone-900'}`}>{v as number}</p>
              <p className="text-[10.5px] text-stone-500 mt-0.5">{k as string}</p>
            </div>
          ))}
        </div>

        {/* staff on shift */}
        <Section title={L('Staff on shift', 'พนักงานเข้ากะ')} badge={L(`${shifts.length} staff${onBreakCount ? ` · ${onBreakCount} on break` : ''}`, `${shifts.length} คน${onBreakCount ? ` · พัก ${onBreakCount}` : ''}`)} href="/pos/users" hrefLabel={L('View team →', 'ดูทีม →')}>
          {shifts.length === 0 ? <Empty>{L('No one on shift yet', 'ยังไม่มีใครเข้ากะ')}</Empty> : (
            <div className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
              {shifts.map(s => (
                <div key={s.staffId} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-8 h-8 rounded-lg grid place-items-center text-white font-bold text-[13px]" style={{ background: s.color || '#78716c' }}>{s.name.charAt(0).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-medium truncate">{s.name}</p>
                    <p className="text-[11.5px] text-stone-500">{L('In', 'เข้ากะ')} {clockOf(s.clockIn)} · {elapsed(s.clockIn, lang)}</p>
                  </div>
                  {s.onBreak
                    ? <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">{BREAK_EMOJI[s.breakType ?? 'other']} {L('On break', 'พักเบรค')}</span>
                    : <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">{L('Working', 'ทำงาน')}</span>}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* low stock */}
        {lowStock.length > 0 && (
          <Section title={L('Low stock', 'สต็อกใกล้หมด')} badge={L(`${lowStock.length} items`, `${lowStock.length} รายการ`)} badgeAlert href="/pos/inventory" hrefLabel={L('Inventory →', 'คลัง →')}>
            <div className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
              {lowStock.slice(0, 4).map(i => {
                const out = i.currentStock === 0
                return (
                  <div key={i.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-medium truncate">{i.name}</p>
                      <p className="text-[11.5px] text-stone-500">{L('Reorder at', 'จุดสั่งซื้อ')} {i.lowStockThreshold} {i.unit}</p>
                    </div>
                    <span className={`text-sm font-black tabular-nums ${out ? 'text-red-500' : 'text-orange-500'}`}>
                      {out ? L('Out', 'หมด') : L(`${i.currentStock} left`, `เหลือ ${i.currentStock}`)}
                    </span>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* pending reservations */}
        {pendingResv.length > 0 && (
          <Section title={L('Reservations pending', 'การจองรอยืนยัน')} badge={L(`${pendingResv.length} items`, `${pendingResv.length} รายการ`)} badgeBlue>
            <div className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
              {pendingResv.slice(0, 4).map(r => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 grid place-items-center text-base shrink-0">📅</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate">{r.customerName} · {L(`${r.partySize} guests`, `${r.partySize} ท่าน`)}</p>
                    <p className="text-[11.5px] text-stone-500">{r.reservedDate === today ? L('Today', 'วันนี้') : r.reservedDate} {r.startTime}{r.note ? ` · ${r.note}` : ''}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button disabled={busyResv === r.id} onClick={() => decideResv(r.id, 'approved')}
                      className="text-[12px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500 text-white disabled:opacity-40">{L('Accept', 'รับ')}</button>
                    <button disabled={busyResv === r.id} onClick={() => decideResv(r.id, 'rejected')}
                      className="text-[12px] font-bold px-2.5 py-1.5 rounded-lg bg-stone-100 text-stone-500 disabled:opacity-40">{L('Reject', 'ปฏิเสธ')}</button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* top items */}
        {topItems.length > 0 && (
          <Section title={L("Today's best sellers", 'เมนูขายดีวันนี้')} href="/pos/analytics" hrefLabel={L('Report →', 'รายงาน →')}>
            <div className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col gap-2.5">
              {topItems.map(it => (
                <div key={it.name}>
                  <div className="flex justify-between text-[12.5px] mb-1">
                    <b className="font-medium text-stone-900">{it.name}</b>
                    <span className="text-stone-500 tabular-nums">{it.qty} · {baht(it.total)}</span>
                  </div>
                  <div className="h-[7px] rounded-full bg-stone-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(it.qty / topMax) * 100}%`, background: 'linear-gradient(90deg,#FBBF24,#F59E0B)' }} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* quick actions */}
        <div className="grid grid-cols-2 gap-2.5 mt-5">
          {[
            ['/pos', L('Open POS', 'เปิด POS'), 'bg-stone-900 text-white'],
            ['/pos/analytics', L('Sales report', 'รายงานยอดขาย'), 'bg-blue-50 text-blue-700'],
            ['/pos/cash', L('Cash / close', 'เงินสด / ปิดร้าน'), 'bg-emerald-50 text-emerald-700'],
            ['/pos/users', L('Manage staff', 'จัดการพนักงาน'), 'bg-purple-50 text-purple-700'],
          ].map(([href, label, cls]) => (
            <Link key={href} href={href} className="bg-white border border-stone-200 rounded-2xl p-3.5 flex items-center gap-2.5 active:scale-[.98] transition">
              <span className={`w-8 h-8 rounded-xl grid place-items-center text-[15px] ${cls}`}>›</span>
              <span className="font-bold text-[13.5px] text-stone-900">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function Section({ title, badge, badgeAlert, badgeBlue, href, hrefLabel, children }: {
  title: string; badge?: string; badgeAlert?: boolean; badgeBlue?: boolean; href?: string; hrefLabel?: string; children: React.ReactNode
}) {
  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 mb-2.5">
        <h2 className="font-bold text-sm">{title}</h2>
        {badge && (
          <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${
            badgeAlert ? 'bg-red-50 text-red-600' : badgeBlue ? 'bg-blue-50 text-blue-600' : 'bg-stone-100 text-stone-500'
          }`}>{badge}</span>
        )}
        {href && <Link href={href} className="ml-auto text-[11.5px] font-semibold text-amber-600">{hrefLabel}</Link>}
      </div>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-stone-200 rounded-2xl py-6 text-center text-sm text-stone-400">{children}</div>
}
