'use client'

import { useState, useEffect, useRef, use, useCallback } from 'react'
import type { MenuItem } from '@/lib/types'
import { type CatEntry, CATEGORIES_CHANGED_EVENT, loadAllCategories } from '@/lib/categories'

// ─── Types ────────────────────────────────────────────────────────────────────

type CartItem = {
  menuId: string
  name: string
  nameTh: string
  qty: number
  price: number
  variantLabel?: string
}

type OrderStatus = 'pending' | 'accepted' | 'ready' | 'delivered' | 'cancelled'

type PlacedOrder = {
  id: string
  status: OrderStatus
  items: CartItem[]
  total: number
  note: string
}

type Phase = 'info' | 'menu' | 'tracking'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function baht(n: number) { return '฿' + n.toLocaleString() }

function cartKey(c: { menuId: string; variantLabel?: string }) {
  return c.variantLabel ? `${c.menuId}::${c.variantLabel}` : c.menuId
}

// Fallback icon shown on menu items with no photo — keyed by category value.
const CAT_ICONS: Record<string, string> = {
  all: '🍽️', cocktail: '🍹', beer: '🍺', drink: '🥤',
  snack: '🍿', food: '🍔', shot: '🥃', other: '🏷️',
}

const ALL_CHIP: CatEntry = { value: 'all', label: 'All', color: '' }

const TABLES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'VIP1', 'BAR']

const STATUS_STEPS: { key: OrderStatus; label: string; labelTh: string; icon: string }[] = [
  { key: 'pending',   label: 'Order Received',  labelTh: 'รับออเดอร์แล้ว',  icon: '✓'  },
  { key: 'accepted',  label: 'Preparing',        labelTh: 'กำลังเตรียม',     icon: '🔥' },
  { key: 'ready',     label: 'Ready!',            labelTh: 'เสร็จแล้ว!',      icon: '🎉' },
  { key: 'delivered', label: 'Delivered',         labelTh: 'ส่งแล้ว',         icon: '😊' },
]

function statusIndex(s: OrderStatus) {
  const idx = STATUS_STEPS.findIndex(st => st.key === s)
  return idx === -1 ? 0 : idx
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrderPage({ params }: { params: Promise<{ tableNo: string }> }) {
  const { tableNo } = use(params)

  const [menu, setMenu]         = useState<MenuItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [category, setCategory] = useState('all')
  const [allCats, setAllCats]   = useState<CatEntry[]>(() => loadAllCategories())

  // Live-refresh category tabs when Items → Categories adds/deletes/reorders —
  // same mechanism as the POS ordering screen, so both stay in sync.
  useEffect(() => {
    const refresh = () => setAllCats(loadAllCategories())
    window.addEventListener(CATEGORIES_CHANGED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(CATEGORIES_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const [cart, setCart]         = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [note, setNote]         = useState('')
  const [addedKey, setAddedKey] = useState<string | null>(null)

  const [variantItem, setVariantItem] = useState<MenuItem | null>(null)
  const [variantSels, setVariantSels] = useState<Record<string, string>>({})

  const [phase, setPhase]             = useState<Phase>('info')
  const [submitting, setSubmitting]   = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [orders, setOrders]           = useState<PlacedOrder[]>([])
  const [showConfirm, setShowConfirm] = useState(false)

  const [customerName, setCustomerName] = useState('')
  const [infoError, setInfoError]       = useState('')

  // Table is fixed by the QR code that was scanned — the customer never picks it
  const selectedTable = TABLES.includes(tableNo) ? tableNo : (tableNo || TABLES[0])

  const noteRef = useRef<HTMLTextAreaElement>(null)

  // ── Load menu ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/menu')
      .then(r => r.json())
      .then(d => { setMenu((d.menu ?? []).filter((m: MenuItem) => m.available)); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // ── Poll order status ─────────────────────────────────────────────────────────

  const pollOrders = useCallback(async () => {
    if (!orders.length) return
    const updated = await Promise.all(
      orders.map(async o => {
        try {
          const r = await fetch(`/api/orders/${o.id}`)
          if (!r.ok) return o
          const d = await r.json()
          return { ...o, status: d.order.status as OrderStatus }
        } catch { return o }
      })
    )
    setOrders(updated)
  }, [orders])

  useEffect(() => {
    if (phase !== 'tracking') return
    const iv = setInterval(pollOrders, 5000)
    return () => clearInterval(iv)
  }, [phase, pollOrders])

  // ── Derived ───────────────────────────────────────────────────────────────────

  const categories = [ALL_CHIP, ...allCats]
  const filtered   = menu.filter(m => category === 'all' || m.category === category)
  const cartTotal  = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const cartCount  = cart.reduce((s, c) => s + c.qty, 0)

  const latestOrder  = orders[orders.length - 1] ?? null
  const latestStatus = latestOrder?.status ?? null
  const isReady      = latestStatus === 'ready' || latestStatus === 'delivered'

  // ── Cart helpers ──────────────────────────────────────────────────────────────

  function addItem(item: MenuItem, variantLabel?: string, priceAdjust = 0) {
    const key = variantLabel ? `${item.id}::${variantLabel}` : item.id
    const displayName = variantLabel ? `${item.name} (${variantLabel})` : item.name
    setCart(prev => {
      const idx = prev.findIndex(c => cartKey(c) === key)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = { ...next[idx], qty: next[idx].qty + 1 }; return next
      }
      return [...prev, { menuId: item.id, name: displayName, nameTh: item.nameTh, qty: 1, price: item.price + priceAdjust, variantLabel }]
    })
    setAddedKey(key)
    setTimeout(() => setAddedKey(null), 800)
  }

  function tapItem(item: MenuItem) {
    if (item.variants && item.variants.length > 0) {
      setVariantItem(item); setVariantSels({})
    } else {
      addItem(item)
    }
  }

  function confirmVariant() {
    if (!variantItem) return
    if (variantItem.variants?.some(v => v.required && !variantSels[v.id])) return
    const labels: string[] = []
    let priceAdjust = 0
    variantItem.variants?.forEach(v => {
      const opt = v.options.find(o => o.id === variantSels[v.id])
      if (opt) { labels.push(opt.name); priceAdjust += opt.priceAdjust }
    })
    addItem(variantItem, labels.join(', ') || undefined, priceAdjust)
    setVariantItem(null); setVariantSels({})
  }

  function changeQty(key: string, delta: number) {
    setCart(prev => prev.map(c => cartKey(c) === key ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0))
  }

  // ── Submit order ──────────────────────────────────────────────────────────────

  async function placeOrder() {
    if (cart.length === 0 || submitting) return
    setSubmitting(true); setSubmitError('')
    try {
      const r = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNo: selectedTable,
          customerName: customerName.trim(),
          source: 'qr',
          note: note.trim(),
          items: cart.map(c => ({ menuId: c.menuId, name: c.name, qty: c.qty, price: c.price, variantLabel: c.variantLabel })),
        }),
      })
      if (!r.ok) {
        const d = await r.json()
        setSubmitError(d.error ?? 'Something went wrong')
        setSubmitting(false)
        setShowConfirm(false)
        return
      }
      const d = await r.json()
      const placed: PlacedOrder = {
        id:     d.order?.id ?? '',
        status: 'pending',
        items:  [...cart],
        total:  cartTotal,
        note:   note.trim(),
      }
      setOrders(prev => [...prev, placed])
      setCart([])
      setNote('')
      setCartOpen(false)
      setShowConfirm(false)
      setPhase('tracking')
    } catch {
      setSubmitError('Network error — please try again')
      setShowConfirm(false)
    }
    setSubmitting(false)
  }

  // ── Confirm customer info ───────────────────────────────────────────────────

  function confirmInfo() {
    if (!customerName.trim()) { setInfoError('Please enter your name'); return }
    if (!selectedTable)        { setInfoError('Please select a table'); return }
    setInfoError('')
    setPhase('menu')
  }

  // ─── Customer info screen ──────────────────────────────────────────────────────

  if (phase === 'info') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-5" style={{ userSelect: 'none' }}>
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
          <div className="text-center mb-6">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Siam Amsterdam</p>
            <h1 className="text-xl font-black text-gray-900 mt-0.5">Welcome! 👋</h1>
            <p className="text-sm text-gray-400 mt-1">Please tell us your name before ordering</p>
          </div>

          <div className="flex items-center justify-center mb-5">
            <div className="bg-amber-500 text-black px-4 py-2 rounded-xl font-black text-sm">
              🪑 Table {selectedTable}
            </div>
          </div>

          <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest block mb-2">Your Name</label>
          <input
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="e.g. Somchai"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400 transition"
            style={{ userSelect: 'text' }}
            autoFocus
          />

          {infoError && <p className="text-xs text-red-500 text-center mt-3">{infoError}</p>}

          <button
            onClick={confirmInfo}
            className="w-full mt-5 py-4 rounded-2xl bg-gray-900 text-white font-black text-base shadow-lg shadow-gray-900/20 active:scale-[0.98] transition"
          >
            Continue to Menu →
          </button>
        </div>
      </div>
    )
  }

  // ─── Tracking screen ──────────────────────────────────────────────────────────

  if (phase === 'tracking') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col" style={{ userSelect: 'none' }}>

        <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Siam Amsterdam</p>
              <h1 className="text-lg font-black text-gray-900 leading-none">Order Status</h1>
            </div>
            <div className="bg-amber-500 text-black px-3 py-1.5 rounded-xl font-black text-sm">
              Table {selectedTable}
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-md mx-auto w-full px-4 py-6 flex flex-col gap-6">

          {orders.map((order, i) => {
            const stepIdx     = statusIndex(order.status)
            const isCancelled = order.status === 'cancelled'
            const currentStep = STATUS_STEPS[stepIdx]
            const isThisReady = order.status === 'ready' || order.status === 'delivered'

            return (
              <div key={order.id} className="bg-white rounded-3xl shadow-sm overflow-hidden border border-gray-100">

                {/* Order header */}
                <div className={`px-5 py-4 flex items-center justify-between ${
                  isCancelled ? 'bg-gray-50' : isThisReady ? 'bg-emerald-50' : 'bg-white'
                }`}>
                  <div>
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest">Order #{i + 1}</p>
                    <p className="font-black text-lg text-gray-900">{baht(order.total)}</p>
                  </div>
                  {isCancelled ? (
                    <span className="text-xs font-bold text-red-500 bg-red-50 border border-red-100 px-3 py-1.5 rounded-xl">
                      Cancelled
                    </span>
                  ) : (
                    <div className="text-right">
                      <p className="text-2xl">{currentStep.icon}</p>
                      <p className="text-xs font-bold text-gray-700 mt-0.5">{currentStep.label}</p>
                      <p className="text-[10px] text-gray-400">{currentStep.labelTh}</p>
                    </div>
                  )}
                </div>

                {/* Progress stepper */}
                {!isCancelled && (
                  <div className="px-5 pb-4">
                    <div className="flex items-center mb-3">
                      {STATUS_STEPS.map((st, si) => (
                        <div key={st.key} className="flex items-center flex-1">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 transition-all ${
                            si < stepIdx  ? 'bg-emerald-500 text-white' :
                            si === stepIdx ? 'bg-gray-900 text-white'   :
                                             'bg-gray-100 text-gray-300'
                          }`}>
                            {si < stepIdx ? '✓' : si + 1}
                          </div>
                          {si < STATUS_STEPS.length - 1 && (
                            <div className={`flex-1 h-0.5 rounded transition-all ${si < stepIdx ? 'bg-emerald-400' : 'bg-gray-100'}`} />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex">
                      {STATUS_STEPS.map((st, si) => (
                        <p key={st.key} className={`text-[9px] font-semibold text-center flex-1 ${
                          si === stepIdx ? 'text-gray-900' : 'text-gray-300'
                        }`}>
                          {st.label}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Items */}
                <div className="px-5 pb-4 border-t border-gray-50 pt-3">
                  <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mb-2">Items</p>
                  <div className="flex flex-col gap-1">
                    {order.items.map((item, j) => (
                      <div key={j} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700 flex-1">
                          {item.name}
                          {item.variantLabel && <span className="text-gray-400 text-xs"> · {item.variantLabel}</span>}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0 ml-2">×{item.qty} · {baht(item.price * item.qty)}</span>
                      </div>
                    ))}
                  </div>
                  {order.note && <p className="text-xs text-gray-400 mt-2 italic">Note: {order.note}</p>}
                </div>

                {/* Ready banner */}
                {order.status === 'ready' && (
                  <div className="mx-4 mb-4 bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
                    <p className="text-2xl mb-1">🎉</p>
                    <p className="font-black text-emerald-800">Your order is ready!</p>
                    <p className="text-sm text-emerald-600 mt-0.5">Staff will bring it to you shortly.</p>
                    <p className="text-xs text-emerald-500 mt-0.5">อาหารพร้อมแล้ว พนักงานกำลังนำมาส่ง</p>
                  </div>
                )}
              </div>
            )
          })}

          <button
            onClick={() => setPhase('menu')}
            className="w-full py-4 rounded-2xl bg-gray-900 text-white font-black text-base shadow-lg shadow-gray-900/20 active:scale-[0.98] transition"
          >
            + Order More
          </button>
          <p className="text-xs text-center text-gray-400 pb-4">Table {selectedTable} · Refreshing every 5 seconds</p>
        </main>
      </div>
    )
  }

  // ─── Menu screen ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ userSelect: 'none' }}>

      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Siam Amsterdam</p>
            <h1 className="text-lg font-black text-gray-900 leading-none">Order Menu</h1>
          </div>
          <div className="flex items-center gap-2">
            {latestOrder && (
              <button
                onClick={() => setPhase('tracking')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  isReady ? 'bg-emerald-500 text-white animate-pulse' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {isReady ? '🎉' : '⏳'} {isReady ? 'Ready!' : 'Tracking'}
              </button>
            )}
            <div className="bg-amber-500 text-black px-3 py-1.5 rounded-xl font-black text-sm">
              Table {selectedTable}
            </div>
          </div>
        </div>

        <div className="max-w-md mx-auto">
          <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {categories.map(cat => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition active:scale-95 ${
                  category === cat.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-4 pb-32">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <p className="text-4xl mb-3 animate-pulse">🍽️</p>
            <p className="text-sm">Loading menu...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <p className="text-4xl mb-3">🤷</p>
            <p className="text-sm">No items in this category</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(item => {
              const key        = item.id
              const inCartQty  = cart.filter(c => c.menuId === item.id).reduce((s, c) => s + c.qty, 0)
              const justAdded  = addedKey === key
              const hasVariants = (item.variants?.length ?? 0) > 0
              return (
                <button
                  key={item.id}
                  onClick={() => tapItem(item)}
                  className={`relative bg-white rounded-2xl shadow-sm overflow-hidden text-left active:scale-95 transition-all border-2 ${
                    justAdded ? 'border-amber-400 shadow-amber-100' : inCartQty > 0 ? 'border-amber-200' : 'border-transparent'
                  }`}
                >
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-full aspect-[4/3] object-cover" />
                  ) : (
                    <div className="w-full aspect-[4/3] bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
                      <span className="text-4xl">{CAT_ICONS[item.category] ?? '🏷️'}</span>
                    </div>
                  )}
                  {inCartQty > 0 && (
                    <span className="absolute top-2 right-2 bg-amber-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shadow-sm">
                      {inCartQty}
                    </span>
                  )}
                  {hasVariants && (
                    <span className="absolute top-2 left-2 bg-black/40 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      options
                    </span>
                  )}
                  <div className="p-3">
                    <p className="font-bold text-sm text-gray-900 leading-snug line-clamp-2">{item.name}</p>
                    {item.nameTh && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.nameTh}</p>}
                    <div className="flex items-center justify-between mt-2">
                      <span className="font-black text-amber-600">{baht(item.price)}</span>
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-base transition ${
                        justAdded ? 'bg-amber-500 text-white' : 'bg-gray-900 text-white'
                      }`}>
                        {justAdded ? '✓' : '+'}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* Floating cart bar */}
      {cartCount > 0 && !cartOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
          <div className="max-w-md mx-auto pointer-events-auto">
            <button
              onClick={() => setCartOpen(true)}
              className="w-full bg-gray-900 text-white rounded-2xl px-5 py-4 flex items-center justify-between shadow-xl active:scale-[0.98] transition"
            >
              <div className="flex items-center gap-3">
                <span className="bg-amber-500 text-black text-xs font-black w-7 h-7 rounded-full flex items-center justify-center">{cartCount}</span>
                <span className="font-semibold text-sm">View Order</span>
              </div>
              <span className="font-black">{baht(cartTotal)}</span>
            </button>
          </div>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCartOpen(false)} />
          <div className="relative bg-white rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="font-black text-lg text-gray-900">Your Order</h2>
              <button onClick={() => setCartOpen(false)} className="text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center text-xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-2">
              <div className="flex flex-col divide-y divide-gray-50">
                {cart.map(c => {
                  const key = cartKey(c)
                  return (
                    <div key={key} className="flex items-center gap-3 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 leading-snug">{c.name}</p>
                        {c.variantLabel && <p className="text-xs text-gray-400 mt-0.5">{c.variantLabel}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">{baht(c.price)} each</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => changeQty(key, -1)} className="w-8 h-8 rounded-full bg-gray-100 active:bg-gray-200 flex items-center justify-center font-bold text-gray-600 transition">−</button>
                        <span className="w-5 text-center font-black text-sm">{c.qty}</span>
                        <button onClick={() => changeQty(key, 1)} className="w-8 h-8 rounded-full bg-gray-900 active:bg-gray-700 flex items-center justify-center font-bold text-white transition">+</button>
                      </div>
                      <span className="text-sm font-bold text-amber-600 shrink-0 min-w-[52px] text-right">{baht(c.price * c.qty)}</span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest block mb-2">Special Request / Note</label>
                <textarea
                  ref={noteRef}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. No ice, extra spicy, allergy info..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400 transition resize-none"
                  style={{ userSelect: 'text' }}
                />
              </div>
            </div>
            <div className="px-5 pt-3 pb-6 border-t border-gray-100 shrink-0">
              <div className="flex justify-between items-baseline mb-4">
                <span className="text-sm text-gray-500">Total</span>
                <span className="text-2xl font-black text-gray-900">{baht(cartTotal)}</span>
              </div>
              {submitError && <p className="text-xs text-red-500 text-center mb-3">{submitError}</p>}
              <button
                onClick={() => setShowConfirm(true)}
                disabled={submitting || cart.length === 0}
                className={`w-full py-4 rounded-2xl font-black text-base transition active:scale-[0.98] ${
                  submitting ? 'bg-gray-200 text-gray-400 cursor-wait' : 'bg-gray-900 text-white shadow-lg shadow-gray-900/20'
                }`}
              >
                {submitting ? '⏳ Placing order...' : 'Place Order →'}
              </button>
              <p className="text-xs text-gray-400 text-center mt-2">Table {selectedTable} · Staff will bring your order</p>
            </div>
          </div>
        </div>
      )}

      {/* Confirm order modal — final check before submitting */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" onClick={() => !submitting && setShowConfirm(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3 text-center">
              <p className="text-3xl mb-1">🧐</p>
              <h3 className="font-black text-lg text-gray-900">Please Check Your Order</h3>
              <p className="text-xs text-gray-400 mt-1">Make sure everything below is correct before confirming</p>
            </div>
            <div className="px-5 pb-3 max-h-[40vh] overflow-y-auto">
              <div className="flex flex-col divide-y divide-gray-50 bg-gray-50 rounded-2xl px-3">
                {cart.map(c => (
                  <div key={cartKey(c)} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 leading-snug">
                        {c.name} <span className="text-gray-400 font-normal">×{c.qty}</span>
                      </p>
                      {c.variantLabel && <p className="text-xs text-gray-400 mt-0.5">{c.variantLabel}</p>}
                    </div>
                    <span className="text-sm font-bold text-amber-600 shrink-0">{baht(c.price * c.qty)}</span>
                  </div>
                ))}
              </div>
              {note.trim() && (
                <p className="text-xs text-gray-500 mt-3 italic">Note: {note.trim()}</p>
              )}
              <div className="flex justify-between items-baseline mt-3 px-1">
                <span className="text-sm text-gray-500">Total</span>
                <span className="text-xl font-black text-gray-900">{baht(cartTotal)}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1 px-1">Table {selectedTable}{customerName.trim() && ` · ${customerName.trim()}`}</p>
            </div>
            <div className="px-5 pb-5 pt-2 flex flex-col gap-2">
              <button
                onClick={placeOrder}
                disabled={submitting}
                className={`w-full py-4 rounded-2xl font-black text-base transition active:scale-[0.98] ${
                  submitting ? 'bg-gray-200 text-gray-400 cursor-wait' : 'bg-gray-900 text-white shadow-lg shadow-gray-900/20'
                }`}
              >
                {submitting ? '⏳ Placing order...' : '✓ Yes, Confirm Order'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
                className="w-full py-3 rounded-2xl font-bold text-sm text-gray-500 hover:bg-gray-50 transition active:scale-[0.98] disabled:opacity-40"
              >
                ← Go Back, Let Me Check
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Variant modal */}
      {variantItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setVariantItem(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-gray-900">{variantItem.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">Base {baht(variantItem.price)}</p>
              </div>
              <button onClick={() => setVariantItem(null)} className="text-gray-400 text-xl w-7 h-7 flex items-center justify-center shrink-0">×</button>
            </div>
            <div className="p-5 flex flex-col gap-4 max-h-[50vh] overflow-y-auto">
              {variantItem.variants?.map(v => (
                <div key={v.id}>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                    {v.name}{v.required && <span className="text-amber-500 ml-1 normal-case font-normal">*required</span>}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {v.options.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setVariantSels(s => ({ ...s, [v.id]: opt.id }))}
                        className={`py-2.5 px-3 rounded-xl text-sm font-semibold border-2 transition active:scale-95 text-left ${
                          variantSels[v.id] === opt.id
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {opt.name}
                        {opt.priceAdjust !== 0 && (
                          <span className="block text-xs opacity-60 mt-0.5">
                            {opt.priceAdjust > 0 ? '+' : ''}{baht(opt.priceAdjust)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 pb-5 pt-3 border-t border-gray-100">
              {variantItem.variants?.some(v => v.required && !variantSels[v.id]) && (
                <p className="text-xs text-amber-500 text-center mb-2">Please select all required options *</p>
              )}
              <button
                onClick={confirmVariant}
                disabled={variantItem.variants?.some(v => v.required && !variantSels[v.id])}
                className="w-full py-3 rounded-xl bg-gray-900 text-white font-bold transition active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Add to Order →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
