'use client'

import { authedFetch } from '@/lib/supabase-browser'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePosLang } from '@/lib/pos-i18n'
import type { TableTile } from '@/lib/floor'
import type { Reservation, ReservationStatus } from '@/lib/reservations'

const POLL_MS = 15000
const ACTIVE: ReservationStatus[] = ['pending', 'approved', 'seated']

// ─── Bilingual copy (uses usePosLang().lang; page-local like the order pages) ──
const CO = {
  th: {
    title: 'การจองโต๊ะ',
    newBadge: 'ใหม่',
    refresh: 'รีเฟรช',
    tabPending: 'รอยืนยัน',
    tabUpcoming: 'กำลังจะถึง',
    tabAll: 'ทั้งหมด',
    empty: 'ยังไม่มีการจอง',
    ref: 'รหัส',
    ppl: 'คน',
    table: 'โต๊ะ',
    zone: 'โซน',
    noTable: 'ให้ร้านจัดให้',
    phone: 'โทร',
    conflict: 'อาจชนกับการจองอื่น',
    cancelReason: 'เหตุผลที่ลูกค้ายกเลิก',
    overrideNote: 'จองทับโต๊ะที่ชนกัน (บังคับ)',
    errTaken: 'โต๊ะนี้ถูกจองในช่วงเวลานี้แล้ว — เปิด "จองทับ" เพื่อยืนยัน',
    approve: 'ยืนยัน',
    reject: 'ปฏิเสธ',
    seat: 'เช็คอิน',
    complete: 'จบงาน',
    noShow: 'ไม่มา',
    cancel: 'ยกเลิก',
    // modal
    approveTitle: 'ยืนยันการจอง',
    rejectTitle: 'ปฏิเสธการจอง',
    assignTable: 'กำหนดโต๊ะ (ถ้าต้องการ)',
    replyLabel: 'ข้อความถึงลูกค้า (ไม่บังคับ)',
    replyPhApprove: 'เช่น ยืนยันการจองเรียบร้อย รอต้อนรับนะครับ',
    replyPhReject: 'เช่น ขออภัย ช่วงเวลานี้เต็มแล้ว',
    sending: 'กำลังส่ง…',
    close: 'ปิด',
    today: 'วันนี้',
    tomorrow: 'พรุ่งนี้',
    statusApproved: 'ยืนยันแล้ว',
    statusPending: 'รอยืนยัน',
    statusRejected: 'ปฏิเสธ',
    statusSeated: 'เช็คอินแล้ว',
    statusCompleted: 'จบงาน',
    statusNoShow: 'ไม่มา',
    statusCancelled: 'ยกเลิก',
  },
  en: {
    title: 'Table Bookings',
    newBadge: 'NEW',
    refresh: 'Refresh',
    tabPending: 'Pending',
    tabUpcoming: 'Upcoming',
    tabAll: 'All',
    empty: 'No reservations yet',
    ref: 'Ref',
    ppl: 'pax',
    table: 'Table',
    zone: 'Zone',
    noTable: 'Venue assigns',
    phone: 'Tel',
    conflict: 'May conflict with another booking',
    cancelReason: 'Customer cancel reason',
    overrideNote: 'Force onto the conflicting table',
    errTaken: 'That table is already booked for this time — turn on "force" to confirm',
    approve: 'Approve',
    reject: 'Reject',
    seat: 'Check in',
    complete: 'Complete',
    noShow: 'No-show',
    cancel: 'Cancel',
    approveTitle: 'Approve booking',
    rejectTitle: 'Reject booking',
    assignTable: 'Assign a table (optional)',
    replyLabel: 'Message to customer (optional)',
    replyPhApprove: "e.g. Your booking is confirmed — see you soon!",
    replyPhReject: 'e.g. Sorry, this time slot is fully booked.',
    sending: 'Sending…',
    close: 'Close',
    today: 'Today',
    tomorrow: 'Tomorrow',
    statusApproved: 'Approved',
    statusPending: 'Pending',
    statusRejected: 'Rejected',
    statusSeated: 'Checked in',
    statusCompleted: 'Completed',
    statusNoShow: 'No-show',
    statusCancelled: 'Cancelled',
  },
} as const

type Copy = Record<keyof typeof CO.en, string>
type Tab = 'pending' | 'upcoming' | 'all'

// Venue-local (Bangkok) calendar dates, so the Today/Tomorrow labels and the
// Upcoming filter match the server's day. en-CA formats as YYYY-MM-DD.
function todayISO() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) }
function isoPlus(days: number) {
  const d = new Date(`${todayISO()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function statusMeta(s: ReservationStatus, c: Copy) {
  switch (s) {
    case 'approved':  return { label: c.statusApproved,  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
    case 'pending':   return { label: c.statusPending,   cls: 'bg-amber-100 text-amber-700 border-amber-200' }
    case 'rejected':  return { label: c.statusRejected,  cls: 'bg-red-100 text-red-600 border-red-200' }
    case 'seated':    return { label: c.statusSeated,    cls: 'bg-blue-100 text-blue-700 border-blue-200' }
    case 'completed': return { label: c.statusCompleted, cls: 'bg-stone-100 text-stone-500 border-stone-200' }
    case 'no_show':   return { label: c.statusNoShow,    cls: 'bg-red-50 text-red-500 border-red-100' }
    case 'cancelled': return { label: c.statusCancelled, cls: 'bg-stone-100 text-stone-400 border-stone-200' }
  }
}

// Two reservations conflict if same date + same table + overlapping window,
// both still holding a table. Used to warn staff before they approve an overlap.
function conflictsWith(r: Reservation, all: Reservation[]): Reservation | null {
  if (!r.tableNo) return null
  for (const o of all) {
    if (o.id === r.id) continue
    if (o.tableNo !== r.tableNo) continue
    if (o.reservedDate !== r.reservedDate) continue
    if (!ACTIVE.includes(o.status)) continue
    if (r.startTime < o.endTime && r.endTime > o.startTime) return o
  }
  return null
}

export default function ReservationsPage() {
  const { lang } = usePosLang()
  const c = CO[lang]

  const [items, setItems] = useState<Reservation[]>([])
  const [tiles, setTiles] = useState<TableTile[]>([])
  const [tab, setTab] = useState<Tab>('pending')
  const [modal, setModal] = useState<{ r: Reservation; action: 'approve' | 'reject'; conflict: boolean } | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const r = await authedFetch('/api/reservations')
      if (r.ok) {
        const d = await r.json()
        if (Array.isArray(d.reservations)) setItems(d.reservations)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchAll()
    authedFetch('/api/settings').then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d?.floorTiles)) setTiles(d.floorTiles) }).catch(() => {})
    const iv = setInterval(fetchAll, POLL_MS)
    return () => clearInterval(iv)
  }, [fetchAll])

  // Returns true on success. On failure (e.g. 409 overlap without override) it
  // resyncs from the server so the optimistic change is reverted.
  async function patch(r: Reservation, body: Record<string, unknown>): Promise<boolean> {
    // optimistic update
    setItems(prev => prev.map(x => x.id === r.id ? { ...x, ...(body as Partial<Reservation>) } : x))
    try {
      const res = await authedFetch(`/api/reservations/${r.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const d = await res.json()
        if (d?.reservation) setItems(prev => prev.map(x => x.id === r.id ? d.reservation : x))
        return true
      }
      await fetchAll()   // revert optimistic change
      return false
    } catch { await fetchAll(); return false }
  }

  const pending = items.filter(r => r.status === 'pending')

  const shown = useMemo(() => {
    const today = todayISO()
    let list = items
    if (tab === 'pending') list = items.filter(r => r.status === 'pending')
    else if (tab === 'upcoming') list = items.filter(r => r.reservedDate >= today && ACTIVE.includes(r.status))
    // sort by date then time
    return [...list].sort((a, b) =>
      a.reservedDate === b.reservedDate ? a.startTime.localeCompare(b.startTime) : a.reservedDate.localeCompare(b.reservedDate))
  }, [items, tab])

  // group shown by date
  const groups = useMemo(() => {
    const m = new Map<string, Reservation[]>()
    for (const r of shown) { const a = m.get(r.reservedDate) ?? []; a.push(r); m.set(r.reservedDate, a) }
    return Array.from(m.entries())
  }, [shown])

  function dateLabel(d: string) {
    if (d === todayISO()) return c.today
    if (d === isoPlus(1)) return c.tomorrow
    return d
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FAF8F4]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-200 shrink-0 bg-white">
        <span className="text-xl">📅</span>
        <h1 className="font-black text-base tracking-tight text-stone-900">{c.title}</h1>
        {pending.length > 0 && (
          <span className="bg-red-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full animate-pulse">
            {pending.length} {c.newBadge}
          </span>
        )}
        <button onClick={fetchAll}
          className="ml-auto text-xs font-semibold text-stone-500 hover:text-stone-800 border border-stone-200 rounded-lg px-3 py-1.5 transition active:scale-95">
          ↻ {c.refresh}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-4 py-2.5 border-b border-stone-200 shrink-0 bg-white">
        {([['pending', c.tabPending], ['upcoming', c.tabUpcoming], ['all', c.tabAll]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition active:scale-95 ${
              tab === k ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-500 border-stone-200'}`}>
            {label}{k === 'pending' && pending.length > 0 ? ` (${pending.length})` : ''}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {groups.length === 0 ? (
          <div className="text-center text-stone-300 text-sm py-16">{c.empty}</div>
        ) : (
          <div className="max-w-2xl mx-auto flex flex-col gap-5">
            {groups.map(([date, rows]) => (
              <div key={date}>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">{dateLabel(date)}</p>
                <div className="flex flex-col gap-2.5">
                  {rows.map(r => (
                    <ReservationCard key={r.id} r={r} c={c} conflict={conflictsWith(r, items)}
                      onApprove={() => setModal({ r, action: 'approve', conflict: !!conflictsWith(r, items) })}
                      onReject={() => setModal({ r, action: 'reject', conflict: false })}
                      onSeat={() => patch(r, { status: 'seated' })}
                      onComplete={() => patch(r, { status: 'completed' })}
                      onNoShow={() => patch(r, { status: 'no_show' })}
                      onCancel={() => patch(r, { status: 'cancelled' })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <DecisionModal c={c} tiles={tiles} data={modal}
          onClose={() => setModal(null)}
          onSubmit={(body) => patch(modal.r, body)}
        />
      )}
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function ReservationCard({ r, c, conflict, onApprove, onReject, onSeat, onComplete, onNoShow, onCancel }: {
  r: Reservation; c: Copy; conflict: Reservation | null
  onApprove: () => void; onReject: () => void; onSeat: () => void
  onComplete: () => void; onNoShow: () => void; onCancel: () => void
}) {
  const meta = statusMeta(r.status, c)
  const border = r.status === 'pending' ? 'border-amber-300 ring-1 ring-amber-100' : 'border-stone-200'
  return (
    <div className={`bg-white rounded-2xl border ${border} p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-stone-900">{r.customerName}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
          </div>
          <p className="text-[11px] text-stone-400 font-mono mt-0.5">{c.ref} {r.refCode}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-black text-stone-900 tabular-nums">{r.startTime}–{r.endTime}</p>
          <p className="text-xs text-stone-500">{r.partySize} {c.ppl}</p>
        </div>
      </div>

      {/* Detail chips */}
      <div className="flex flex-wrap gap-1.5 mt-2.5 text-xs">
        {r.zone && <Chip>{c.zone}: {r.zone}</Chip>}
        <Chip strong>{c.table}: {r.tableNo || c.noTable}</Chip>
        {r.eventName && <Chip>🎉 {r.eventName}</Chip>}
        {r.phone && <Chip>📞 {r.phone}</Chip>}
      </div>

      {r.requirements && (
        <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 text-xs text-amber-800">
          📝 {r.requirements}
        </div>
      )}

      {conflict && (
        <div className="mt-2 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 text-xs text-red-600 font-semibold">
          ⚠ {c.conflict} ({conflict.refCode} · {conflict.startTime}–{conflict.endTime})
        </div>
      )}

      {r.status === 'cancelled' && r.cancelReason && (
        <div className="mt-2 bg-stone-100 border border-stone-200 rounded-lg px-3 py-1.5 text-xs text-stone-600">
          🚫 {c.cancelReason}: {r.cancelReason}
        </div>
      )}

      {r.staffReply && (
        <p className="mt-2 text-xs text-stone-500 italic">↳ {r.staffReply}</p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        {r.status === 'pending' && (<>
          <ActBtn tone="primary" onClick={onApprove}>✓ {c.approve}</ActBtn>
          <ActBtn tone="danger" onClick={onReject}>✕ {c.reject}</ActBtn>
        </>)}
        {r.status === 'approved' && (<>
          <ActBtn tone="blue" onClick={onSeat}>{c.seat}</ActBtn>
          <ActBtn tone="ghost" onClick={onNoShow}>{c.noShow}</ActBtn>
          <ActBtn tone="ghost" onClick={onCancel}>{c.cancel}</ActBtn>
        </>)}
        {r.status === 'seated' && (
          <ActBtn tone="primary" onClick={onComplete}>{c.complete}</ActBtn>
        )}
      </div>
    </div>
  )
}

function Chip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded-full border ${strong ? 'bg-stone-900 text-white border-stone-900' : 'bg-stone-50 text-stone-600 border-stone-200'}`}>
      {children}
    </span>
  )
}

function ActBtn({ tone, onClick, children }: { tone: 'primary' | 'danger' | 'blue' | 'ghost'; onClick: () => void; children: React.ReactNode }) {
  const cls = {
    primary: 'bg-amber-500 hover:bg-amber-400 text-black',
    danger:  'bg-white border border-red-200 text-red-600 hover:bg-red-50',
    blue:    'bg-blue-600 hover:bg-blue-500 text-white',
    ghost:   'bg-white border border-stone-200 text-stone-500 hover:bg-stone-50',
  }[tone]
  return (
    <button onClick={onClick} className={`text-xs font-bold px-3.5 py-1.5 rounded-lg transition active:scale-95 ${cls}`}>
      {children}
    </button>
  )
}

// ─── Approve / Reject modal ───────────────────────────────────────────────────
function DecisionModal({ c, tiles, data, onClose, onSubmit }: {
  c: Copy; tiles: TableTile[]
  data: { r: Reservation; action: 'approve' | 'reject'; conflict: boolean }
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>
}) {
  const { r, action, conflict } = data
  const isApprove = action === 'approve'
  const [reply, setReply] = useState('')
  const [table, setTable] = useState(r.tableNo ?? '')
  // Approving a flagged conflict defaults to forcing it (the staff saw the warning).
  const [override, setOverride] = useState(conflict)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function go() {
    setBusy(true); setErr('')
    const body: Record<string, unknown> = {
      status: isApprove ? 'approved' : 'rejected',
      staffReply: reply.trim() || undefined,
    }
    if (isApprove && table !== (r.tableNo ?? '')) body.tableNo = table || undefined
    if (isApprove) body.override = override
    const ok = await onSubmit(body)
    if (ok) onClose()
    else { setBusy(false); setErr(c.errTaken) }   // 409 overlap without override
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-black text-stone-900">{isApprove ? c.approveTitle : c.rejectTitle}</h2>
        <p className="text-sm text-stone-400 mt-0.5">{r.customerName} · {r.reservedDate} {r.startTime}–{r.endTime} · {r.partySize} {c.ppl}</p>

        {isApprove && tiles.length > 0 && (
          <div className="mt-4">
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">{c.assignTable}</label>
            <select value={table} onChange={e => setTable(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400">
              <option value="">{c.noTable}</option>
              {tiles.map(tl => (
                <option key={tl.id} value={tl.tableNo}>
                  {tl.tableNo}{tl.zone ? ` · ${tl.zone}` : ''} ({tl.capacity})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-4">
          <label className="text-xs font-semibold text-stone-500 mb-1.5 block">{c.replyLabel}</label>
          <textarea value={reply} onChange={e => setReply(e.target.value)} rows={3}
            placeholder={isApprove ? c.replyPhApprove : c.replyPhReject}
            className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-amber-400" />
        </div>

        {isApprove && conflict && (
          <label className="mt-3 flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 cursor-pointer">
            <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-red-500 shrink-0" />
            <span className="text-xs text-red-700 leading-snug">⚠ {c.overrideNote}</span>
          </label>
        )}

        {err && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{err}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-stone-500 bg-stone-100 rounded-xl hover:bg-stone-200 transition active:scale-95">
            {c.close}
          </button>
          <button onClick={go} disabled={busy}
            className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition active:scale-95 disabled:opacity-40 ${
              isApprove ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-red-600 hover:bg-red-500 text-white'}`}>
            {busy ? c.sending : isApprove ? `✓ ${c.approve}` : `✕ ${c.reject}`}
          </button>
        </div>
      </div>
    </div>
  )
}
