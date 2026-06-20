'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Order, OrderStatus } from '@/lib/types'

// ─── Config ───────────────────────────────────────────────────────────────────

const POLL_INTERVAL = 10 // seconds
const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'accepted', 'ready']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsed(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

function elapsedSecs(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
}

function urgencyClass(iso: string, status: OrderStatus): string {
  const secs = elapsedSecs(iso)
  if (status === 'pending') {
    if (secs > 300) return 'border-red-500 bg-red-950/30'   // > 5 min — critical
    if (secs > 120) return 'border-orange-500 bg-orange-950/20' // > 2 min — warn
    return 'border-amber-500 bg-amber-950/20'
  }
  if (status === 'accepted') return 'border-blue-500 bg-blue-950/20'
  if (status === 'ready')    return 'border-emerald-500 bg-emerald-950/20'
  return 'border-gray-700 bg-gray-900/30'
}

// ─── NEXT STATUS BUTTON ────────────────────────────────────────────────────────

const NEXT: Partial<Record<OrderStatus, { label: string; next: OrderStatus; cls: string }>> = {
  pending:  { label: '▶ Accept',   next: 'accepted', cls: 'bg-amber-500 hover:bg-amber-400 text-black' },
  accepted: { label: '✓ Ready',    next: 'ready',    cls: 'bg-blue-600 hover:bg-blue-500 text-white'  },
  ready:    { label: '✓ Served',   next: 'delivered', cls: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
}

// ─── ORDER CARD ───────────────────────────────────────────────────────────────

function OrderCard({ order, onUpdate }: { order: Order; onUpdate: (id: string, s: OrderStatus) => void }) {
  const action = NEXT[order.status]
  const secs   = elapsedSecs(order.createdAt)

  const timerClass =
    order.status === 'pending' && secs > 300 ? 'text-red-400 font-bold animate-pulse' :
    order.status === 'pending' && secs > 120 ? 'text-orange-400 font-semibold' :
    'text-white/40'

  return (
    <div className={`rounded-2xl border-2 p-4 flex flex-col gap-3 ${urgencyClass(order.createdAt, order.status)}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black text-white">T{order.tableNo}</span>
          {order.memberName && (
            <span className="text-[10px] bg-purple-700/50 text-purple-200 px-2 py-0.5 rounded-full font-semibold">
              👤 {order.memberName}
            </span>
          )}
        </div>
        <span className={`text-sm tabular-nums ${timerClass}`}>
          ⏱ {elapsed(order.createdAt)}
        </span>
      </div>

      {/* Items */}
      <ul className="flex flex-col gap-1.5">
        {order.items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-white font-black text-lg leading-tight min-w-[1.5rem] text-right">
              ×{item.qty}
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-white font-semibold text-sm">{item.name}</span>
              {item.nameTh && (
                <span className="text-white/40 text-[11px]">{item.nameTh}</span>
              )}
              {item.variantLabel && (
                <span className="text-amber-300/70 text-[10px]">{item.variantLabel}</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Note */}
      {order.note && (
        <div className="bg-yellow-900/30 border border-yellow-700/40 rounded-xl px-3 py-2">
          <p className="text-yellow-200 text-sm">📝 {order.note}</p>
        </div>
      )}

      {/* Action */}
      {action && (
        <button
          onClick={() => onUpdate(order.id, action.next)}
          className={`w-full py-3 rounded-xl font-bold text-sm transition active:scale-95 ${action.cls}`}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

// ─── COLUMN ───────────────────────────────────────────────────────────────────

const COLUMN_META: Record<string, { icon: string; label: string; emptyMsg: string }> = {
  pending:  { icon: '🔴', label: 'New Orders',  emptyMsg: 'No pending orders' },
  accepted: { icon: '🟡', label: 'In Progress', emptyMsg: 'Nothing being prepared' },
  ready:    { icon: '🟢', label: 'Ready',        emptyMsg: 'Nothing ready yet' },
}

function Column({
  status, orders, onUpdate,
}: {
  status: OrderStatus
  orders: Order[]
  onUpdate: (id: string, s: OrderStatus) => void
}) {
  const meta = COLUMN_META[status]
  return (
    <div className="flex flex-col gap-3">
      {/* Column header */}
      <div className="flex items-center gap-2 sticky top-0 z-10 bg-gray-950 py-2">
        <span className="text-base">{meta.icon}</span>
        <h2 className="text-sm font-bold text-white/80 uppercase tracking-widest">{meta.label}</h2>
        {orders.length > 0 && (
          <span className="ml-auto bg-white/10 text-white/60 text-xs font-bold px-2 py-0.5 rounded-full">
            {orders.length}
          </span>
        )}
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-white/10 p-8 text-center text-white/20 text-sm">
          {meta.emptyMsg}
        </div>
      ) : (
        orders.map(o => (
          <OrderCard key={o.id} order={o} onUpdate={onUpdate} />
        ))
      )}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function KitchenPage() {
  const [orders,     setOrders]     = useState<Order[]>([])
  const [loading,    setLoading]    = useState(true)
  const [countdown,  setCountdown]  = useState(POLL_INTERVAL)
  const [lastUpdate, setLastUpdate] = useState('')
  const [updating,   setUpdating]   = useState<Set<string>>(new Set())
  const [, forceRender] = useState(0) // timer tick for elapsed display
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const todayStr = new Date().toDateString()

  const fetchOrders = useCallback(async () => {
    try {
      const r = await fetch('/api/orders')
      if (r.ok) {
        const d = await r.json()
        const active = (d.orders as Order[]).filter(o =>
          ACTIVE_STATUSES.includes(o.status) &&
          new Date(o.createdAt).toDateString() === todayStr
        )
        setOrders(active)
        setLastUpdate(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [todayStr])

  // Initial fetch + poll
  useEffect(() => {
    fetchOrders()
    setCountdown(POLL_INTERVAL)
    const iv = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchOrders()
          return POLL_INTERVAL
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [fetchOrders])

  // Re-render every 10s so elapsed timers stay fresh
  useEffect(() => {
    timerRef.current = setInterval(() => forceRender(n => n + 1), 10000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  async function handleUpdate(id: string, status: OrderStatus) {
    setUpdating(prev => new Set(prev).add(id))
    try {
      const r = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (r.ok) {
        if (status === 'delivered') {
          setOrders(prev => prev.filter(o => o.id !== id))
        } else {
          const data = await r.json()
          setOrders(prev => prev.map(o => o.id === id ? data.order : o))
        }
      }
    } finally {
      setUpdating(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const pending  = orders.filter(o => o.status === 'pending')
  const accepted = orders.filter(o => o.status === 'accepted')
  const ready    = orders.filter(o => o.status === 'ready')

  if (loading) {
    return (
      <div className="flex-1 bg-gray-950 flex items-center justify-center">
        <div className="text-4xl animate-pulse">🍳</div>
      </div>
    )
  }

  return (
    <div
      className="flex-1 bg-gray-950 text-white flex flex-col overflow-hidden"
    >
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <span className="text-xl">🍳</span>
        <h1 className="font-black text-base tracking-tight">Kitchen Display</h1>

        {pending.length > 0 && (
          <span className="bg-red-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full animate-pulse">
            {pending.length} new
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {lastUpdate && (
            <span className="text-[11px] text-white/30">อัพเดตล่าสุด {lastUpdate}</span>
          )}
          <button
            onClick={() => { fetchOrders(); setCountdown(POLL_INTERVAL) }}
            className="text-xs text-white/40 hover:text-white/70 border border-white/10 hover:border-white/30 px-3 py-1.5 rounded-lg transition"
          >
            ↺ {countdown}s
          </button>
        </div>
      </div>

      {/* Kanban columns */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/5 min-h-full">
          {(['pending', 'accepted', 'ready'] as OrderStatus[]).map(status => (
            <div key={status} className="bg-gray-950 p-4 overflow-y-auto">
              <Column
                status={status}
                orders={
                  status === 'pending'  ? pending  :
                  status === 'accepted' ? accepted : ready
                }
                onUpdate={handleUpdate}
              />
            </div>
          ))}
        </div>
      </div>

      {/* "updating" overlay per card is implicit via disabled state;
          show subtle global indicator here */}
      {updating.size > 0 && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg z-50">
          Saving...
        </div>
      )}
    </div>
  )
}
