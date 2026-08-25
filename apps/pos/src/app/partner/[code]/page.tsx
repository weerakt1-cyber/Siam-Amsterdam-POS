'use client'

import { useState, useEffect, use, useCallback } from 'react'

type Commission = { storeName: string; amount: number; status: string; createdAt: string }
type Data = {
  affiliate: { name: string; referralCode: string; commissionRate: number }
  pending: number; paid: number; total: number
  commissions: Commission[]
}

const baht = (n: number) => '฿' + Math.round(n).toLocaleString()

export default function PartnerPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const [data, setData]   = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/partner/${encodeURIComponent(code)}`)
      if (r.status === 404) { setError('ไม่พบลิงก์นายหน้านี้'); setLoading(false); return }
      if (!r.ok) { setError('โหลดข้อมูลไม่สำเร็จ'); setLoading(false); return }
      setData(await r.json()); setError(''); setLoading(false)
    } catch { setError('เชื่อมต่อไม่ได้'); setLoading(false) }
  }, [code])

  // Load on open + poll every 30s so earnings stay fresh.
  useEffect(() => {
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [load])

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">กำลังโหลด…</div>
  if (error)   return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="text-center"><p className="text-4xl mb-3">🔗</p><p className="text-gray-500">{error}</p></div>
    </div>
  )
  if (!data) return null

  return (
    <div className="min-h-screen bg-gray-50 px-5 py-8" style={{ userSelect: 'none' }}>
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-5">
          <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest">รายได้นายหน้า</p>
          <h1 className="text-2xl font-black text-gray-900 mt-1">{data.affiliate.name}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            โค้ด <span className="font-mono text-amber-600">{data.affiliate.referralCode}</span> · คอม {Math.round(data.affiliate.commissionRate * 100)}%
          </p>
        </div>

        {/* Earnings summary */}
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

        {/* Commission history */}
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

        <p className="text-[11px] text-gray-400 text-center mt-4">อัปเดตอัตโนมัติทุก 30 วินาที · ลิงก์นี้เป็นความลับ อย่าแชร์ต่อ</p>
      </div>
    </div>
  )
}
