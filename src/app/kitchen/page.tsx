'use client'

import { useEffect, useState } from 'react'
import type { Order, OrderStatus } from '@/lib/types'

function ageMin(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
}

function baht(n: number) {
  return '฿' + new Intl.NumberFormat('th-TH').format(n)
}

const ACTIVE: OrderStatus[] = ['pending', 'accepted']

export default function KitchenDisplay() {
  const [orders, setOrders] = useState<Order[]>([])
  const [time, setTime] = useState('')
  const [tick, setTick] = useState(0)

  // นาฬิกา
  useEffect(() => {
    const t = setInterval(() => {
      setTime(new Date().toLocaleTimeString('th-TH'))
      setTick((n) => n + 1)
    }, 1000)
    return () => clearInterval(t)
  }, [])

  // Fetch orders ทุก 4 วินาที
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/orders')
        if (res.ok) {
          const data = await res.json()
          setOrders(data.orders.filter((o: Order) => ACTIVE.includes(o.status)))
        }
      } catch {}
    }
    fetch_()
    const iv = setInterval(fetch_, 4000)
    return () => clearInterval(iv)
  }, [])

  async function markAccepted(id: string) {
    await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    })
  }

  async function markReady(id: string) {
    await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ready' }),
    })
    setOrders((prev) => prev.filter((o) => o.id !== id))
  }

  // suppress unused tick warning
  void tick

  return (
    <div
      className="min-h-screen bg-black text-white p-4 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black tracking-wider">🍹 KITCHEN / BAR DISPLAY</h1>
          <p className="text-xs text-white/40 mt-0.5">Auto-refresh ทุก 4 วิ • ออเดอร์ pending &amp; กำลังทำ</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black font-mono">{time}</p>
          <p className="text-sm text-white/40">{orders.length} รายการค้าง</p>
        </div>
      </div>

      {/* Cards */}
      {orders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-white/20">
          <p className="text-6xl mb-5">✅</p>
          <p className="text-3xl font-black">ครัว/บาร์ว่าง</p>
          <p className="text-base mt-2">ไม่มีออเดอร์ค้างอยู่</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {orders.map((order) => {
            const age = ageMin(order.createdAt)
            const urgent = age >= 5
            const isPending = order.status === 'pending'

            return (
              <div
                key={order.id}
                className={`rounded-2xl border-4 p-5 flex flex-col gap-3 ${
                  isPending
                    ? urgent
                      ? 'border-red-500 bg-red-950'
                      : 'border-yellow-400 bg-yellow-950'
                    : 'border-green-500 bg-green-950'
                }`}
              >
                {/* Table + age */}
                <div className="flex items-start justify-between">
                  <span className="text-5xl font-black leading-none">{order.tableNo}</span>
                  <div className="text-right">
                    <p className={`text-xl font-black ${urgent ? 'text-red-400' : 'text-white/50'}`}>
                      {age}น.
                      {urgent && ' ⚠️'}
                    </p>
                    <p className="text-xs text-white/40">
                      {isPending ? '⏳ รอรับ' : '🔥 กำลังทำ'}
                    </p>
                    <p className="text-xs text-white/30">
                      {order.source === 'tilda' ? '📱 Tilda' : '🖥️ POS'}
                    </p>
                  </div>
                </div>

                {/* Items */}
                <div className="grid gap-2 flex-1">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-lg font-bold leading-snug">{item.nameTh || item.name}</span>
                      <span className="text-3xl font-black text-orange-400 ml-2">×{item.qty}</span>
                    </div>
                  ))}
                  {order.note && (
                    <p className="text-sm text-yellow-300 bg-yellow-950/60 rounded-lg px-3 py-2 mt-1">
                      📝 {order.note}
                    </p>
                  )}
                </div>

                {/* Total + action */}
                <div className="border-t border-white/20 pt-3 grid gap-2">
                  <p className="font-black text-lg">{baht(order.total)}</p>
                  {isPending ? (
                    <button
                      onClick={() => markAccepted(order.id)}
                      className="w-full rounded-xl bg-yellow-500 hover:bg-yellow-400 py-3 font-black text-black text-sm transition active:scale-95"
                    >
                      ✅ รับออเดอร์
                    </button>
                  ) : (
                    <button
                      onClick={() => markReady(order.id)}
                      className="w-full rounded-xl bg-green-500 hover:bg-green-400 py-3 font-black text-black text-sm transition active:scale-95"
                    >
                      🔔 เสร็จแล้ว!
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      <div className="mt-5 text-center text-xs text-white/20">
        <a href="/pos" className="hover:text-white/50 transition">← กลับหน้า POS</a>
      </div>
    </div>
  )
}
