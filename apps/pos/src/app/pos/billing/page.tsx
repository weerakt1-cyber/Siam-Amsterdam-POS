'use client'

import { useEffect, useState, useCallback } from 'react'
import { authedFetch } from '@/lib/supabase-browser'
import { usePosLang } from '@/lib/pos-i18n'
import type { BillingCycle } from '@/lib/plans'

type Sub = { plan: string; status: string; until: string | null; cycle: string | null; lockedPrice: number | null }
type Plan = { id: string; label: string; monthly: number; yearly: number; features: string[] }
type Payment = { id: string; kind: string; plan: string; cycle: string; amount: number; status: string; createdAt: string }
type RenewResp = { payment: { id: string }; amount: number; months: number; qrDataUrl: string; promptpayId: string }
type Ai = { status: string; balance: number; allowance: number; until: string | null; nextReset: string | null } | null
type AiAddon = { monthly: number; yearly: number; topupMin: number }

const todayStr = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
function daysLeft(until: string | null): number | null {
  if (!until) return null
  return Math.round((Date.parse(until) - Date.parse(todayStr())) / 86400000)
}
const baht = (n: number) => '฿' + n.toLocaleString()

export default function BillingPage() {
  const { lang } = usePosLang()
  const L = (en: string, th: string) => (lang === 'en' ? en : th)
  const [sub, setSub] = useState<Sub | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [ppConfigured, setPpConfigured] = useState(true)
  const [denied, setDenied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [renew, setRenew] = useState<RenewResp | null>(null)
  const [busy, setBusy] = useState(false)
  const [slipDone, setSlipDone] = useState(false)
  const [ai, setAi] = useState<Ai>(null)
  const [aiAddon, setAiAddon] = useState<AiAddon | null>(null)
  const [topup, setTopup] = useState('')

  const load = useCallback(async () => {
    const r = await authedFetch('/api/billing')
    if (r.status === 401 || r.status === 403) { setDenied(true); setLoading(false); return }
    if (!r.ok) { setErr(lang === 'en' ? 'Failed to load' : 'โหลดข้อมูลไม่สำเร็จ'); setLoading(false); return }
    const d = await r.json()
    setSub(d.subscription); setPlans(d.plans ?? []); setPayments(d.payments ?? [])
    setAi(d.ai ?? null); setAiAddon(d.aiAddon ?? null)
    setPpConfigured(!!d.promptpayConfigured); setLoading(false)
  }, [lang])
  useEffect(() => { load() }, [load])

  // Start any payment (subscription / AI / top-up) → returns a QR + slip upload.
  async function startPayment(body: Record<string, unknown>) {
    setErr(''); setBusy(true); setSlipDone(false); setRenew(null)
    try {
      const r = await authedFetch('/api/billing/renew', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || L('Failed to start the transaction', 'เริ่มรายการไม่สำเร็จ')); return }
      setRenew(d)
    } finally { setBusy(false) }
  }
  const startRenew = () => startPayment({ kind: 'subscription', plan: 'pro', cycle })

  async function uploadSlip(file: File) {
    if (!renew) return
    setErr(''); setBusy(true)
    try {
      const fd = new FormData(); fd.set('slip', file)
      const r = await authedFetch(`/api/billing/${renew.payment.id}/slip`, { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || L('Slip upload failed', 'อัปโหลดสลิปไม่สำเร็จ')); return }
      setSlipDone(true); await load()
    } finally { setBusy(false) }
  }

  if (denied) return <Centered emoji="🔒" title={L('Store owners only', 'เฉพาะเจ้าของร้าน')} body={L('The billing page is only open to store admins', 'หน้าเรียกเก็บเงินเปิดให้เฉพาะผู้ใช้สิทธิ์ admin ของร้าน')} />
  if (loading) return <div className="p-6 text-gray-400">{L('Loading…', 'กำลังโหลด…')}</div>

  const dl = daysLeft(sub?.until ?? null)
  const pro = plans.find(p => p.id === 'pro')

  return (
    <div className="p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-black text-gray-900 mb-1">{L('Packages & Renewal', 'แพ็คเกจ & การต่ออายุ')}</h1>
        <p className="text-sm text-gray-400 mb-5">{L('Renew via PromptPay then attach the slip — an admin will confirm', 'ต่ออายุผ่าน PromptPay แล้วแนบสลิป — ผู้ดูแลจะยืนยันให้')}</p>

        {err && <p className="text-sm text-red-500 mb-3">{err}</p>}

        {/* Current status */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{L('Current package', 'แพ็คเกจปัจจุบัน')}</p>
              <p className="text-xl font-black text-gray-900 mt-0.5">{sub?.plan ?? '—'} · <span className={sub?.status === 'active' ? 'text-emerald-600' : 'text-amber-600'}>{sub?.status}</span></p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-gray-400">{L('Expires', 'หมดอายุ')}</p>
              <p className="font-bold text-gray-900">{sub?.until ?? '—'}</p>
              {dl != null && <p className={`text-xs ${dl < 0 ? 'text-red-500' : 'text-gray-400'}`}>{dl < 0 ? L(`${-dl} days over`, `เลย ${-dl} วัน`) : L(`${dl} days left`, `เหลือ ${dl} วัน`)}</p>}
            </div>
          </div>
        </div>

        {!ppConfigured && <p className="text-sm text-amber-600 mb-3">{L("⚠️ The provider hasn't set up PromptPay — online payment isn't ready", '⚠️ ผู้ให้บริการยังไม่ได้ตั้งค่า PromptPay — ชำระเงินออนไลน์ยังไม่พร้อม')}</p>}

        {/* Shared payment QR + slip — used by subscription, AI, and top-up */}
        {renew && (
          <div className="bg-white rounded-2xl border-2 border-amber-300 p-5 mb-4 text-center">
            <p className="text-sm text-gray-500">{L('Transfer', 'โอน')} <span className="font-black text-gray-900">{baht(renew.amount)}</span> {L('to PromptPay', 'ไปที่ PromptPay')}</p>
            <p className="text-xs text-gray-400 mb-3">{renew.promptpayId}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={renew.qrDataUrl} alt="PromptPay QR" className="w-56 h-56 mx-auto" />
            {slipDone ? (
              <p className="mt-4 text-sm font-bold text-emerald-600">{L('✓ Slip sent — awaiting admin confirmation', '✓ ส่งสลิปแล้ว — รอผู้ดูแลยืนยัน')}</p>
            ) : (
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-2">{L('Transfer, then attach the slip here', 'โอนแล้วแนบสลิปที่นี่')}</p>
                <label className="inline-block px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold cursor-pointer">
                  {busy ? L('Uploading…', 'กำลังอัปโหลด…') : L('Choose slip', 'เลือกสลิป')}
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadSlip(f) }} disabled={busy} />
                </label>
              </div>
            )}
          </div>
        )}

        {/* Renew Pro */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
          <p className="font-black text-gray-900 mb-3">{L('Renew Pro', 'ต่ออายุ Pro')}</p>
          <div className="flex gap-2 mb-4">
            {(['monthly', 'yearly'] as BillingCycle[]).map(c => (
              <button key={c} onClick={() => setCycle(c)}
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition ${cycle === c ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600'}`}>
                {c === 'monthly' ? `${L('Monthly', 'รายเดือน')} ${pro ? baht(pro.monthly) : ''}` : `${L('Yearly', 'รายปี')} ${pro ? baht(pro.yearly) : ''}`}
                {c === 'yearly' && <span className="block text-[10px] font-normal opacity-70">{L('First-year discount', 'ปีแรกมีส่วนลด')}</span>}
              </button>
            ))}
          </div>
          <button disabled={busy || !ppConfigured} onClick={startRenew}
            className="w-full py-3.5 rounded-2xl bg-amber-500 text-black font-black disabled:opacity-40">
            {L('Create renewal QR', 'สร้าง QR ต่ออายุ')}
          </button>
        </div>

        {/* AI add-on */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-black text-gray-900">🤖 AI add-on</p>
            {ai && ai.status !== 'none' ? (
              <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-violet-50 text-violet-700">{ai.status}</span>
            ) : (
              <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-gray-100 text-gray-500">{L('Not subscribed', 'ยังไม่สมัคร')}</span>
            )}
          </div>

          {ai && ai.status !== 'none' && (
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 mb-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">{L('Credit balance', 'เครดิตคงเหลือ')}</span><span className="font-black text-gray-900">{baht(Math.max(0, Math.round(ai.balance)))}</span></div>
              {ai.until && <div className="flex justify-between mt-1"><span className="text-gray-500">{L('AI expires', 'หมดอายุ AI')}</span><span className="text-gray-700">{ai.until}</span></div>}
              {ai.status === 'yearly' && ai.nextReset && <div className="flex justify-between mt-1"><span className="text-gray-500">{L('Next credit reset', 'รีเซ็ตเครดิตถัดไป')}</span><span className="text-gray-700">{ai.nextReset}</span></div>}
            </div>
          )}

          <div className="flex gap-2 mb-3">
            <button disabled={busy || !ppConfigured} onClick={() => startPayment({ kind: 'ai', cycle: 'monthly' })}
              className="flex-1 py-3 rounded-xl border-2 border-violet-300 text-violet-700 text-sm font-bold disabled:opacity-40">
              {L('Subscribe/renew monthly', 'สมัคร/ต่อ รายเดือน')} {aiAddon ? baht(aiAddon.monthly) : ''}
            </button>
            <button disabled={busy || !ppConfigured} onClick={() => startPayment({ kind: 'ai', cycle: 'yearly' })}
              className="flex-1 py-3 rounded-xl border-2 border-violet-300 text-violet-700 text-sm font-bold disabled:opacity-40">
              {L('Yearly', 'รายปี')} {aiAddon ? baht(aiAddon.yearly) : ''}
            </button>
          </div>

          <div className="flex gap-2">
            <input value={topup} onChange={e => setTopup(e.target.value.replace(/\D/g, ''))} inputMode="numeric"
              placeholder={L(`Top up (min ฿${aiAddon?.topupMin ?? 20})`, `เติมเครดิต (ขั้นต่ำ ฿${aiAddon?.topupMin ?? 20})`)}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
            <button disabled={busy || !ppConfigured || !topup} onClick={() => startPayment({ kind: 'ai_topup', amount: Number(topup) })}
              className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-40">{L('Top up', 'เติม')}</button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">{L('1 credit = ฿1 of real AI cost · when credit runs out AI pauses until top-up/reset', '1 เครดิต = ฿1 ของต้นทุน AI จริง · เครดิตหมด AI จะหยุดจนกว่าจะเติม/รีเซ็ต')}</p>
        </div>

        {/* History */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="font-black text-gray-900 mb-3">{L('Payment history', 'ประวัติการชำระ')}</p>
          {payments.length === 0 ? <p className="text-sm text-gray-400">{L('No records yet', 'ยังไม่มีรายการ')}</p> : (
            <div className="flex flex-col divide-y divide-gray-50">
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <span className="font-semibold text-gray-900">
                      {p.kind === 'ai' ? `AI · ${p.cycle}` : p.kind === 'ai_topup' ? L('AI credit top-up', 'เติมเครดิต AI') : `${p.plan} · ${p.cycle}`}
                    </span>
                    <span className="text-gray-400 ml-2 text-xs">{p.createdAt.slice(0, 10)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-900 font-bold">{baht(p.amount)}</span>
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${p.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : p.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>{p.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Centered({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-4xl mb-3">{emoji}</p>
        <h1 className="text-xl font-black text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-2">{body}</p>
      </div>
    </div>
  )
}
