'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser, authedFetch } from '@/lib/supabase-browser'

type Commission = { storeName: string; amount: number; status: string; createdAt: string }
type Data = {
  affiliate: { name: string; referralCode: string; commissionRate: number }
  pending: number; paid: number; total: number
  commissions: Commission[]
}

const baht = (n: number) => '฿' + Math.round(n).toLocaleString()

export default function PartnerDashboard() {
  const router = useRouter()
  const [data, setData] = useState<Data | null>(null)
  const [notAffiliate, setNotAffiliate] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const r = await authedFetch('/api/me')
    // 401 = expired/invalid session → sign out first so /auth shows the login
    // form instead of bouncing on the stale session.
    if (r.status === 401) { await getSupabaseBrowser().auth.signOut().catch(() => {}); router.replace('/auth'); return }
    if (r.status === 403) { setNotAffiliate(true); setLoading(false); return }
    if (!r.ok) { setLoading(false); return }
    setData(await r.json()); setLoading(false)
  }, [router])

  useEffect(() => {
    // Require a session first; then load + poll for near-real-time earnings.
    getSupabaseBrowser().auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/auth'); return }
      load()
    })
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [router, load])

  async function logout() {
    await getSupabaseBrowser().auth.signOut()
    router.replace('/auth')
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">กำลังโหลด…</div>

  if (notAffiliate) return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <p className="text-4xl mb-3">🚫</p>
        <h1 className="text-xl font-black text-gray-900">อีเมลนี้ยังไม่ได้ลงทะเบียน</h1>
        <p className="text-sm text-gray-500 mt-2">บัญชีที่ล็อกอินยังไม่ถูกตั้งเป็นนายหน้า — ติดต่อผู้ดูแลระบบให้เพิ่มอีเมลของคุณ</p>
        <button onClick={logout} className="mt-4 text-sm font-bold px-4 py-2 rounded-xl bg-gray-900 text-white">ออกจากระบบ</button>
      </div>
    </div>
  )
  if (!data) return null

  return (
    <div className="min-h-screen px-5 py-8" style={{ userSelect: 'none' }}>
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest">รายได้นายหน้า</p>
            <h1 className="text-2xl font-black text-gray-900">{data.affiliate.name}</h1>
            <p className="text-xs text-gray-400 mt-0.5">โค้ด <span className="font-mono text-amber-600">{data.affiliate.referralCode}</span> · คอม {Math.round(data.affiliate.commissionRate * 100)}%</p>
          </div>
          <button onClick={logout} className="text-xs font-semibold px-3 py-2 rounded-xl bg-white border border-gray-200">ออกจากระบบ</button>
        </div>

        <div className="bg-gradient-to-br from-amber-400 to-amber-500 rounded-3xl p-6 text-center shadow-lg shadow-amber-500/20 mb-3">
          <p className="text-[11px] font-bold text-black/60 uppercase tracking-widest">ยอดค้างจ่าย</p>
          <p className="text-4xl font-black text-black mt-1">{baht(data.pending)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
            <p className="text-[11px] text-gray-400 font-semibold">จ่ายแล้ว</p>
            <p className="text-xl font-black text-emerald-600 mt-0.5">{baht(data.paid)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
            <p className="text-[11px] text-gray-400 font-semibold">รวมทั้งหมด</p>
            <p className="text-xl font-black text-gray-900 mt-0.5">{baht(data.total)}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="font-black text-gray-900 mb-3">รายการคอมมิชชั่น ({data.commissions.length})</p>
          {data.commissions.length === 0 ? (
            <p className="text-sm text-gray-400">ยังไม่มีคอมมิชชั่น — เมื่อร้านที่คุณแนะนำจ่ายเงิน คอมจะขึ้นที่นี่</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-50">
              {data.commissions.map((c, i) => (
                <div key={i} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{c.storeName}</p>
                    <p className="text-[11px] text-gray-400">{c.createdAt.slice(0, 10)}</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-gray-900">{baht(c.amount)}</span>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${c.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {c.status === 'paid' ? 'จ่ายแล้ว' : 'ค้างจ่าย'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-[11px] text-gray-400 text-center mt-4">อัปเดตอัตโนมัติทุก 30 วินาที</p>
      </div>
    </div>
  )
}
