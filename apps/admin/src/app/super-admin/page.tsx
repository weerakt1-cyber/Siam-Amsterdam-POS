'use client'

import { useEffect, useState, useCallback } from 'react'
import { authedFetch, getSupabaseBrowser } from '@/lib/supabase-browser'
import { PLANS, PLAN_IDS, planPrice, INTRO_MONTHLY, YEARLY_FIRST_YEAR_DISCOUNT, type BillingCycle } from '@baze/config'

type Store = {
  id: string; name: string; slug: string | null
  plan: string; status: string; until: string | null
  cycle: string | null; lockedPrice: number | null; affiliateId: string | null
}

type Affiliate = { id: string; name: string; contact: string | null; email: string | null; referralCode: string; commissionRate: number; status: string }
type Earnings = Record<string, { pending: number; paid: number; total: number }>

// ── date helpers (YYYY-MM-DD, client-side) ───────────────────────────────────
const todayStr = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
function daysLeft(until: string | null): number | null {
  if (!until) return null
  return Math.round((Date.parse(until) - Date.parse(todayStr())) / 86400000)
}

export default function SuperAdminPage() {
  const [stores, setStores] = useState<Store[] | null>(null)
  const [affiliates, setAffiliates] = useState<Affiliate[]>([])
  const [denied, setDenied] = useState(false)
  const [err, setErr]       = useState('')
  const [busy, setBusy]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr('')
    const [rs, ra] = await Promise.all([authedFetch('/api/admin/stores'), authedFetch('/api/admin/affiliates')])
    if (rs.status === 401 || rs.status === 403) { setDenied(true); return }
    if (!rs.ok) { setErr('โหลดข้อมูลไม่สำเร็จ'); return }
    setStores((await rs.json()).stores ?? [])
    if (ra.ok) setAffiliates((await ra.json()).affiliates ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id)
    try {
      const r = await authedFetch(`/api/admin/stores/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'อัปเดตไม่สำเร็จ'); return }
      await load()
    } finally { setBusy(null) }
  }

  // Paid renewal: the server extends the sub, records a confirmed payment, and
  // accrues the referrer's commission (see adminRenewStore).
  function renew(s: Store, cycle: BillingCycle) {
    patch(s.id, { action: 'renew', cycle })
  }

  if (denied) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="max-w-sm text-center">
          <p className="text-4xl mb-3">🔒</p>
          <h1 className="text-xl font-black text-gray-900">ไม่มีสิทธิ์เข้าถึง</h1>
          <p className="text-sm text-gray-500 mt-2">หน้านี้สำหรับผู้ดูแลระบบ (super-admin) เท่านั้น — ต้องล็อกอินด้วยอีเมลที่อยู่ใน <code>SUPER_ADMIN_EMAILS</code></p>
          <button
            onClick={async () => { await getSupabaseBrowser().auth.signOut(); window.location.href = '/auth' }}
            className="mt-4 text-sm font-bold px-5 py-2.5 rounded-xl bg-gray-900 text-white"
          >ออกจากระบบแล้วเข้าใหม่</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-black text-gray-900">🛠 Super-admin · จัดการร้าน</h1>
            <p className="text-sm text-gray-400">ต่ออายุ / เปลี่ยนแพ็คเกจ / เปิดร้านใหม่ (เก็บเงิน manual)</p>
          </div>
          <button onClick={load} className="text-sm px-3 py-2 rounded-xl bg-white border border-gray-200 font-semibold">รีเฟรช</button>
        </div>

        {err && <p className="text-sm text-red-500 mb-3">{err}</p>}

        <NewStoreForm onCreated={load} onError={setErr} />

        {stores === null ? (
          <p className="text-gray-400 text-sm">กำลังโหลด…</p>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3">ร้าน</th>
                  <th className="px-4 py-3">แพ็คเกจ</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">หมดอายุ</th>
                  <th className="px-4 py-3">ราคาล็อก</th>
                  <th className="px-4 py-3">นายหน้า</th>
                  <th className="px-4 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {stores.map(s => {
                  const dl = daysLeft(s.until)
                  const badge = s.status === 'active' && (dl == null || dl >= 0) ? 'bg-emerald-50 text-emerald-700'
                    : s.status === 'trial' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600'
                  return (
                    <tr key={s.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-bold text-gray-900">{s.name}</div>
                        <div className="text-[11px] text-gray-400">/{s.slug}</div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={PLAN_IDS.includes(s.plan as never) ? s.plan : 'pro'}
                          onChange={e => patch(s.id, { plan: e.target.value })}
                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
                        >
                          {PLAN_IDS.map(p => <option key={p} value={p}>{PLANS[p].label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${badge}`}>{s.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div>{s.until ?? '—'}</div>
                        {dl != null && <div className={`text-[11px] ${dl < 0 ? 'text-red-500' : 'text-gray-400'}`}>{dl < 0 ? `เลย ${-dl} วัน` : `เหลือ ${dl} วัน`}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.lockedPrice != null ? `฿${s.lockedPrice.toLocaleString()}` : '—'}</td>
                      <td className="px-4 py-3">
                        <select
                          value={s.affiliateId ?? ''}
                          onChange={e => patch(s.id, { affiliateId: e.target.value || null })}
                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs max-w-[120px]"
                        >
                          <option value="">— ไม่มี —</option>
                          {affiliates.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button disabled={busy === s.id} onClick={() => renew(s, 'monthly')}
                            className="text-[11px] font-bold px-2 py-1 rounded-lg bg-gray-900 text-white disabled:opacity-40">+1 เดือน</button>
                          <button disabled={busy === s.id} onClick={() => renew(s, 'yearly')}
                            className="text-[11px] font-bold px-2 py-1 rounded-lg bg-gray-900 text-white disabled:opacity-40">+1 ปี</button>
                          <button disabled={busy === s.id} onClick={() => { const d = prompt('วันหมดอายุใหม่ (YYYY-MM-DD)', s.until ?? todayStr()); if (d) patch(s.id, { until: d, status: 'active' }) }}
                            className="text-[11px] font-bold px-2 py-1 rounded-lg bg-white border border-gray-200">กำหนดเอง</button>
                          <button disabled={busy === s.id} onClick={() => { if (confirm(`ตั้งร้าน "${s.name}" เป็นหมดอายุ?`)) patch(s.id, { status: 'expired' }) }}
                            className="text-[11px] font-bold px-2 py-1 rounded-lg bg-red-50 text-red-600">หมดอายุ</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <PaymentsPanel onChange={load} onError={setErr} />

        <AffiliatesPanel onChange={load} onError={setErr} />

        <p className="text-[11px] text-gray-400 mt-4">
          ราคาอ้างอิง: Pro ฿{planPrice('pro', 'monthly').toLocaleString()}/เดือน · ฿{planPrice('pro', 'yearly').toLocaleString()}/ปี ·
          intro ฿{INTRO_MONTHLY.price}×{INTRO_MONTHLY.months}ด. · รายปีปีแรก −฿{YEARLY_FIRST_YEAR_DISCOUNT}.
          การผูกเจ้าของร้าน (owner) ยังทำผ่าน <code>scripts/provision-store.mjs</code>
        </p>
      </div>
    </div>
  )
}

type Payment = {
  id: string; storeName?: string; storeSlug?: string | null
  kind: string; plan: string; cycle: string; amount: number; status: string
  createdAt: string; slipSignedUrl: string | null
}
const paymentLabel = (p: Payment) =>
  p.kind === 'ai' ? `AI · ${p.cycle}` : p.kind === 'ai_topup' ? 'เติมเครดิต AI' : `${p.plan} · ${p.cycle}`

function PaymentsPanel({ onChange, onError }: { onChange: () => void; onError: (m: string) => void }) {
  const [payments, setPayments] = useState<Payment[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await authedFetch('/api/admin/payments?status=pending')
    if (!r.ok) { setPayments([]); return }
    setPayments((await r.json()).payments ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function act(id: string, action: 'confirm' | 'reject') {
    setBusy(id)
    try {
      const r = await authedFetch(`/api/admin/payments/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); onError(d.error || 'ทำรายการไม่สำเร็จ'); return }
      await load(); onChange()   // refresh both payments and the store list
    } finally { setBusy(null) }
  }

  if (payments === null) return null
  return (
    <div className="mt-6">
      <h2 className="text-lg font-black text-gray-900 mb-2">💸 สลิปที่รอยืนยัน ({payments.length})</h2>
      {payments.length === 0 ? (
        <p className="text-sm text-gray-400">ไม่มีรายการค้าง</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {payments.map(p => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="font-bold text-gray-900">{p.storeName ?? '—'} <span className="text-[11px] text-gray-400">/{p.storeSlug}</span></div>
                <div className="text-xs text-gray-400">{paymentLabel(p)} · {p.createdAt.slice(0, 10)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-black text-gray-900">฿{p.amount.toLocaleString()}</span>
                {p.slipSignedUrl
                  ? <a href={p.slipSignedUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 underline">ดูสลิป</a>
                  : <span className="text-xs text-gray-300">ยังไม่มีสลิป</span>}
                <button disabled={busy === p.id} onClick={() => act(p.id, 'confirm')}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500 text-white disabled:opacity-40">ยืนยัน</button>
                <button disabled={busy === p.id} onClick={() => act(p.id, 'reject')}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 disabled:opacity-40">ปฏิเสธ</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// POS app origin (where /signup and /partner live) — set on the admin project.
const POS_URL = (process.env.NEXT_PUBLIC_POS_URL || '').replace(/\/$/, '')

function AffiliatesPanel({ onChange, onError }: { onChange: () => void; onError: (m: string) => void }) {
  const [affiliates, setAffiliates] = useState<Affiliate[] | null>(null)
  const [earnings, setEarnings] = useState<Earnings>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')   // Google login email for the portal
  const [rate, setRate] = useState('20')   // percent, converted to fraction

  const load = useCallback(async () => {
    const r = await authedFetch('/api/admin/affiliates')
    if (!r.ok) { setAffiliates([]); return }
    const d = await r.json()
    setAffiliates(d.affiliates ?? []); setEarnings(d.earnings ?? {})
  }, [])
  useEffect(() => { load() }, [load])

  async function create() {
    if (!name.trim()) { onError('กรอกชื่อ นายหน้า'); return }
    const pct = Number(rate)
    if (!(pct >= 0) || pct > 100) { onError('% คอมต้องอยู่ 0–100'); return }
    setBusy('new')
    try {
      const r = await authedFetch('/api/admin/affiliates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), contact: contact.trim() || null, email: email.trim() || null, commissionRate: pct / 100 }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); onError(d.error || 'สร้างไม่สำเร็จ'); return }
      setName(''); setContact(''); setEmail(''); await load(); onChange()
    } finally { setBusy(null) }
  }

  async function decide(id: string, status: 'active' | 'rejected', name: string) {
    const verb = status === 'active' ? 'อนุมัติ' : 'ปฏิเสธ'
    if (!confirm(`${verb}ใบสมัครนายหน้าของ "${name}"?`)) return
    setBusy(id)
    try {
      const r = await authedFetch(`/api/admin/affiliates/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      if (!r.ok) { onError('ทำรายการไม่สำเร็จ'); return }
      await load(); onChange()
    } finally { setBusy(null) }
  }

  async function markPaid(id: string, name: string) {
    if (!confirm(`ยืนยันว่าจ่ายคอมค้างทั้งหมดของ "${name}" แล้ว?`)) return
    setBusy(id)
    try {
      const r = await authedFetch(`/api/admin/affiliates/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_paid' }),
      })
      if (!r.ok) { onError('ทำรายการไม่สำเร็จ'); return }
      await load()
    } finally { setBusy(null) }
  }

  if (affiliates === null) return null
  const baht = (n: number) => '฿' + Math.round(n).toLocaleString()

  return (
    <div className="mt-6">
      <h2 className="text-lg font-black text-gray-900 mb-2">🤝 นายหน้า (Affiliate)</h2>

      {/* Create */}
      <div className="mb-3 bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1">ชื่อ</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อนายหน้า" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1">ติดต่อ</label>
          <input value={contact} onChange={e => setContact(e.target.value)} placeholder="เบอร์ / LINE" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1">อีเมล login (Google)</label>
          <input value={email} onChange={e => setEmail(e.target.value)} inputMode="email" placeholder="broker@gmail.com" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1">% คอม</label>
          <input value={rate} onChange={e => setRate(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-20" />
        </div>
        <button disabled={busy === 'new'} onClick={create} className="text-sm font-bold px-4 py-2 rounded-xl bg-gray-900 text-white disabled:opacity-40">เพิ่มนายหน้า</button>
      </div>

      {/* List */}
      {affiliates.length === 0 ? (
        <p className="text-sm text-gray-400">ยังไม่มีนายหน้า</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {affiliates.map(a => {
            const e = earnings[a.id] ?? { pending: 0, paid: 0, total: 0 }
            const isPending = a.status === 'pending'
            return (
              <div key={a.id} className={`flex flex-wrap items-center justify-between gap-3 p-4 ${isPending ? 'bg-amber-50/60' : ''}`}>
                <div>
                  <div className="font-bold text-gray-900">
                    {a.name} <span className="text-[11px] font-mono text-amber-600">{a.referralCode}</span>
                    <button
                      onClick={() => { navigator.clipboard?.writeText(`${POS_URL}/signup?ref=${a.referralCode}`); onError('') }}
                      className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200"
                      title="ลิงก์ให้นายหน้าไปชวนร้านสมัคร (ผูกนายหน้าอัตโนมัติ)"
                    >ลิงก์ชวนร้าน</button>
                    <button
                      onClick={() => { navigator.clipboard?.writeText(`${POS_URL}/partner/${a.referralCode}`); onError('') }}
                      className="ml-1.5 text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                      title="ลิงก์ดูรายได้ (แบบไม่ต้องล็อกอิน)"
                    >ลิงก์รายได้</button>
                  </div>
                  <div className="text-xs text-gray-400">{a.contact || '—'} · คอม {Math.round(a.commissionRate * 100)}% · {a.status}</div>
                  <div className="text-[11px] text-gray-400">{a.email ? `🔑 ${a.email}` : '⚠️ ยังไม่ตั้งอีเมล login'}</div>
                </div>
                {isPending ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-700">ใบสมัครใหม่</span>
                    <button disabled={busy === a.id} onClick={() => decide(a.id, 'active', a.name)}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500 text-white disabled:opacity-40">อนุมัติ</button>
                    <button disabled={busy === a.id} onClick={() => decide(a.id, 'rejected', a.name)}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 disabled:opacity-40">ปฏิเสธ</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-right">
                      <div className="text-amber-600 font-bold">ค้าง {baht(e.pending)}</div>
                      <div className="text-[11px] text-gray-400">จ่ายแล้ว {baht(e.paid)}</div>
                    </div>
                    <button disabled={busy === a.id || e.pending <= 0} onClick={() => markPaid(a.id, a.name)}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500 text-white disabled:opacity-40">มาร์คจ่ายคอม</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-2">คอมเกิดอัตโนมัติทุกครั้งที่ร้าน (ที่ผูกนายหน้าไว้) จ่ายเงินและคุณกดยืนยันสลิป</p>
    </div>
  )
}

function NewStoreForm({ onCreated, onError }: { onCreated: () => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [plan, setPlan] = useState<'free' | 'pro'>('pro')
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!name.trim() || !slug.trim()) { onError('กรอกชื่อและ slug'); return }
    setBusy(true)
    try {
      const r = await authedFetch('/api/admin/stores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), plan }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); onError(d.error || 'สร้างร้านไม่สำเร็จ'); return }
      setName(''); setSlug(''); setOpen(false); onCreated()
    } finally { setBusy(false) }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="mb-4 text-sm font-bold px-4 py-2 rounded-xl bg-amber-500 text-black">+ เปิดร้านใหม่</button>
  }
  return (
    <div className="mb-4 bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1">ชื่อร้าน</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="ร้านทดสอบ 2" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1">slug (a-z0-9-)</label>
        <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} placeholder="test-shop-2" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1">แพ็คเกจ</label>
        <select value={plan} onChange={e => setPlan(e.target.value as 'free' | 'pro')} className="border border-gray-200 rounded-lg px-2 py-2 text-sm">
          {PLAN_IDS.map(p => <option key={p} value={p}>{PLANS[p].label}</option>)}
        </select>
      </div>
      <button disabled={busy} onClick={create} className="text-sm font-bold px-4 py-2 rounded-xl bg-gray-900 text-white disabled:opacity-40">สร้าง</button>
      <button onClick={() => setOpen(false)} className="text-sm px-3 py-2 rounded-xl text-gray-500">ยกเลิก</button>
      <p className="w-full text-[11px] text-gray-400">หมายเหตุ: สร้างที่นี่ = ร้านใหม่แยกข้อมูล แต่ยังต้องผูกเจ้าของด้วย <code>provision-store.mjs --slug {slug || '<slug>'} --owner-email ...</code> (หรืออัปเดต profile.store_id เอง)</p>
    </div>
  )
}
