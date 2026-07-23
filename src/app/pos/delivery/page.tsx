'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Order, OrderStatus, MenuItem, DeliveryChannel } from '@/lib/types'
import {
  DELIVERY_CHANNELS, CHANNEL_KEYS,
  loadDeliverySettings, saveDeliverySettings, type DeliverySettings,
} from '@/lib/delivery'

// ─── Config ───────────────────────────────────────────────────────────────────

const POLL_INTERVAL = 10 // seconds
const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'accepted', 'ready']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsed(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

function baht(n: number): string {
  return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`
}

// ─── Channel badge ────────────────────────────────────────────────────────────

function ChannelBadge({ channel, code }: { channel: DeliveryChannel; code?: string }) {
  const meta = DELIVERY_CHANNELS[channel]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${meta.bgClass}`}>
      {meta.icon} {meta.label}
      {code && <span className="font-mono opacity-80">· {code}</span>}
    </span>
  )
}

// ─── Order card ───────────────────────────────────────────────────────────────

const NEXT: Partial<Record<OrderStatus, { label: string; next: OrderStatus; cls: string }>> = {
  pending:  { label: '▶ Accept',      next: 'accepted', cls: 'bg-amber-500 hover:bg-amber-400 text-black' },
  accepted: { label: '✓ Ready',       next: 'ready',    cls: 'bg-blue-600 hover:bg-blue-500 text-white'  },
  ready:    { label: '🛵 Picked up',  next: 'paid',     cls: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
}

function borderClass(status: OrderStatus): string {
  if (status === 'pending')  return 'border-amber-500 bg-amber-950/20'
  if (status === 'accepted') return 'border-blue-500 bg-blue-950/20'
  if (status === 'ready')    return 'border-emerald-500 bg-emerald-950/20'
  return 'border-gray-700 bg-gray-900/30'
}

function DeliveryCard({ order, onUpdate }: { order: Order; onUpdate: (o: Order, s: OrderStatus) => void }) {
  const action = NEXT[order.status]
  return (
    <div className={`rounded-2xl border-2 p-4 flex flex-col gap-3 ${borderClass(order.status)}`}>
      <div className="flex items-center justify-between gap-2">
        {order.channel && <ChannelBadge channel={order.channel} code={order.platformCode} />}
        <span className="text-sm tabular-nums text-white/40">⏱ {elapsed(order.createdAt)}</span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {order.items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-white font-black text-lg leading-tight min-w-[1.5rem] text-right">×{item.qty}</span>
            <div className="flex flex-col leading-tight">
              <span className="text-white font-semibold text-sm">{item.name}</span>
              {item.nameTh && <span className="text-white/40 text-[11px]">{item.nameTh}</span>}
              {item.variantLabel && <span className="text-amber-300/70 text-[10px]">{item.variantLabel}</span>}
            </div>
          </li>
        ))}
      </ul>

      {order.note && (
        <div className="bg-yellow-900/30 border border-yellow-700/40 rounded-xl px-3 py-2">
          <p className="text-yellow-200 text-sm">📝 {order.note}</p>
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-white/50">{order.items.reduce((s, i) => s + i.qty, 0)} items</span>
        <span className="text-white font-bold">{baht(order.total)}</span>
      </div>

      <div className="flex gap-2">
        {action && (
          <button
            onClick={() => onUpdate(order, action.next)}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition active:scale-95 ${action.cls}`}
          >
            {action.label}
          </button>
        )}
        <button
          onClick={() => { if (confirm('Cancel this delivery order?')) onUpdate(order, 'cancelled') }}
          className="px-3 rounded-xl border border-white/10 text-white/40 hover:text-red-400 hover:border-red-500/50 transition text-sm"
          title="Cancel order"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ─── Quick-entry modal ────────────────────────────────────────────────────────

type CartLine = { menuId: string; name: string; nameTh: string; qty: number; price: number; variantLabel?: string }

function cartKey(c: CartLine) { return c.variantLabel ? `${c.menuId}::${c.variantLabel}` : c.menuId }

function QuickEntryModal({
  menu, settings, onClose, onCreated,
}: {
  menu: MenuItem[]
  settings: DeliverySettings
  onClose: () => void
  onCreated: () => void
}) {
  const [channel, setChannel]       = useState<DeliveryChannel>('grab')
  const [platformCode, setCode]     = useState('')
  const [note, setNote]             = useState('')
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState('all')
  const [cart, setCart]             = useState<CartLine[]>([])
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  // Variant picker state
  const [variantPicking, setVariantPicking] = useState<MenuItem | null>(null)
  const [variantSelections, setVariantSelections] = useState<Record<string, string>>({})

  const categories = useMemo(() => {
    const cats = new Set(menu.map(m => m.category))
    return ['all', ...Array.from(cats)]
  }, [menu])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return menu.filter(m =>
      m.available &&
      (catFilter === 'all' || m.category === catFilter) &&
      (!q || m.name.toLowerCase().includes(q) || m.nameTh.includes(q))
    )
  }, [menu, search, catFilter])

  function addDirect(item: MenuItem, variantLabel?: string, priceAdjust = 0) {
    const displayName = variantLabel ? `${item.name} (${variantLabel})` : item.name
    setCart(prev => {
      const key = variantLabel ? `${item.id}::${variantLabel}` : item.id
      const idx = prev.findIndex(c => cartKey(c) === key)
      if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { menuId: item.id, name: displayName, nameTh: item.nameTh, qty: 1, price: item.price + priceAdjust, variantLabel }]
    })
  }

  function addItem(item: MenuItem) {
    if (item.variants && item.variants.length > 0) {
      setVariantPicking(item)
      setVariantSelections({})
      return
    }
    addDirect(item)
  }

  function confirmVariant() {
    if (!variantPicking) return
    const item = variantPicking
    if (item.variants?.some(v => v.required && !variantSelections[v.id])) return
    const labels: string[] = []
    let priceAdjust = 0
    item.variants?.forEach(v => {
      const opt = v.options.find(o => o.id === variantSelections[v.id])
      if (opt) { labels.push(opt.name); priceAdjust += opt.priceAdjust }
    })
    addDirect(item, labels.join(', ') || undefined, priceAdjust)
    setVariantPicking(null)
    setVariantSelections({})
  }

  function changeQty(key: string, delta: number) {
    setCart(prev => prev
      .map(c => cartKey(c) === key ? { ...c, qty: c.qty + delta } : c)
      .filter(c => c.qty > 0))
  }

  const subtotal   = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const commission = settings.commission[channel]
  const net        = Math.round(subtotal * (1 - commission))

  async function submit() {
    if (cart.length === 0) return
    setSaving(true)
    setError('')
    try {
      const r = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderType: 'delivery',
          channel,
          platformCode: platformCode.trim() || undefined,
          commissionRate: commission,
          source: 'pos',
          note,
          items: cart.map(c => ({ menuId: c.menuId, name: c.name, nameTh: c.nameTh, qty: c.qty, price: c.price, variantLabel: c.variantLabel })),
        }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to create order')
      }
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create order')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="bg-gray-900 border border-white/10 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-white font-black">🛵 New Delivery Order</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Channel select */}
          <div className="flex gap-2">
            {CHANNEL_KEYS.map(key => {
              const meta = DELIVERY_CHANNELS[key]
              const active = channel === key
              return (
                <button
                  key={key}
                  onClick={() => setChannel(key)}
                  className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition active:scale-95 ${
                    active ? 'border-white bg-white/10 text-white' : 'border-white/10 text-white/40 hover:border-white/30'
                  }`}
                  style={active ? { borderColor: meta.color } : undefined}
                >
                  {meta.icon} {meta.label}
                </button>
              )
            })}
          </div>

          {/* Platform code + note */}
          <div className="grid grid-cols-2 gap-3">
            <input
              value={platformCode}
              onChange={e => setCode(e.target.value)}
              placeholder="Platform code (e.g. GF-1234)"
              className="bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
            />
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
            />
          </div>

          {/* Menu search + category filter */}
          <div className="flex gap-2 items-center">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search menu…"
              className="flex-1 bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                  catFilter === cat ? 'bg-white text-gray-900' : 'bg-white/10 text-white/50 hover:bg-white/20'
                }`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>

          {/* Menu grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {filtered.map(item => (
              <button
                key={item.id}
                onClick={() => addItem(item)}
                className="text-left bg-gray-800 hover:bg-gray-700 border border-white/10 rounded-xl p-3 transition active:scale-95"
              >
                <p className="text-white text-sm font-semibold leading-tight">{item.name}</p>
                {item.nameTh && <p className="text-white/40 text-[11px] leading-tight mt-0.5">{item.nameTh}</p>}
                <p className="text-amber-400 text-sm font-bold mt-1">
                  {baht(item.price)}
                  {item.variants && item.variants.length > 0 && <span className="text-white/30 text-[10px] font-normal ml-1">· options</span>}
                </p>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full text-center text-white/25 text-sm py-6">No menu items found</p>
            )}
          </div>
        </div>

        {/* Cart + submit */}
        <div className="border-t border-white/10 p-5 shrink-0 flex flex-col gap-3 bg-gray-900">
          {cart.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
              {cart.map(c => (
                <div key={cartKey(c)} className="flex items-center gap-2 text-sm">
                  <span className="text-white flex-1 truncate">{c.name}</span>
                  <span className="text-white/40 tabular-nums">{baht(c.price * c.qty)}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => changeQty(cartKey(c), -1)} className="w-7 h-7 rounded-lg bg-white/10 text-white hover:bg-white/20 transition">−</button>
                    <span className="w-6 text-center text-white font-bold tabular-nums">{c.qty}</span>
                    <button onClick={() => changeQty(cartKey(c), 1)} className="w-7 h-7 rounded-lg bg-white/10 text-white hover:bg-white/20 transition">+</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">
              Total {baht(subtotal)} · commission {(commission * 100).toFixed(0)}% → net <span className="text-emerald-400 font-bold">{baht(net)}</span>
            </span>
          </div>
          <button
            onClick={submit}
            disabled={cart.length === 0 || saving}
            className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : `Send to Kitchen → ${baht(subtotal)}`}
          </button>
        </div>
      </div>

      {/* Variant picker overlay */}
      {variantPicking && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-6" onClick={() => setVariantPicking(null)}>
          <div className="bg-gray-900 border border-white/10 rounded-3xl w-full max-w-sm flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/10">
              <p className="text-white font-black">{variantPicking.name}</p>
            </div>
            <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[50vh]">
              {variantPicking.variants?.map(v => (
                <div key={v.id}>
                  <p className="text-xs font-bold text-white/40 uppercase tracking-wide mb-2">
                    {v.name}{v.required && <span className="text-red-400 ml-1 normal-case font-normal">*required</span>}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {v.options.map(o => (
                      <button
                        key={o.id}
                        onClick={() => setVariantSelections(prev => ({ ...prev, [v.id]: prev[v.id] === o.id ? '' : o.id }))}
                        className={`py-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition ${
                          variantSelections[v.id] === o.id
                            ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                            : 'border-white/10 text-white/60 hover:border-white/30'
                        }`}
                      >
                        {o.name}{o.priceAdjust !== 0 && <span className="text-[10px] opacity-70 ml-1">{o.priceAdjust > 0 ? `+${o.priceAdjust}` : o.priceAdjust}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 pb-5 pt-3 border-t border-white/10">
              <button
                onClick={confirmVariant}
                disabled={variantPicking.variants?.some(v => v.required && !variantSelections[v.id])}
                className="w-full py-3 rounded-xl bg-white text-gray-900 font-bold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
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

// ─── Commission settings popover ──────────────────────────────────────────────

type GrabApiConfig = {
  clientIdConfigured: boolean
  clientIdLast4: string | null
  clientSecretConfigured: boolean
  merchantId: string
  webhookSecretConfigured: boolean
  autoAccept: boolean
  commission: string
}

function SettingsModal({
  settings, onSave, onClose,
}: {
  settings: DeliverySettings
  onSave: (s: DeliverySettings) => void
  onClose: () => void
}) {
  const [rates, setRates] = useState<Record<DeliveryChannel, string>>({
    grab:       (settings.commission.grab * 100).toFixed(0),
    lineman:    (settings.commission.lineman * 100).toFixed(0),
    shopeefood: (settings.commission.shopeefood * 100).toFixed(0),
  })
  // Grab partner API credentials (server-side app_config; secrets are write-only)
  const [grabCfg, setGrabCfg]         = useState<GrabApiConfig | null>(null)
  const [grabClientId, setClientId]   = useState('')
  const [grabSecret, setGrabSecret]   = useState('')
  const [grabMerchant, setMerchant]   = useState('')
  const [grabWebhookSecret, setWhSecret] = useState('')
  const [grabAutoAccept, setAutoAccept]  = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/delivery/config')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.grab) return
        setGrabCfg(d.grab)
        setMerchant(d.grab.merchantId ?? '')
        setAutoAccept(!!d.grab.autoAccept)
      })
      .catch(() => {})
  }, [])

  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/delivery/webhooks/grab` : ''

  async function save() {
    setSaving(true)
    const commission = { ...settings.commission }
    for (const key of CHANNEL_KEYS) {
      const v = Number(rates[key])
      if (Number.isFinite(v) && v >= 0 && v <= 100) commission[key] = v / 100
    }
    onSave({ commission })

    // Persist Grab config server-side; secrets only when a new value was typed
    const grab: Record<string, unknown> = {
      merchantId: grabMerchant,
      autoAccept: grabAutoAccept,
      commission: (commission.grab * 100).toFixed(0),
    }
    if (grabClientId.trim())      grab.clientId = grabClientId
    if (grabSecret.trim())        grab.clientSecret = grabSecret
    if (grabWebhookSecret.trim()) grab.webhookSecret = grabWebhookSecret
    try {
      await fetch('/api/delivery/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grab }),
      })
    } catch { /* ignore — commission rates already saved locally */ }
    setSaving(false)
    onClose()
  }

  const grabConnected = !!(grabCfg?.clientIdConfigured && grabCfg?.clientSecretConfigured && grabCfg?.merchantId)

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-gray-900 border border-white/10 rounded-3xl w-full max-w-md p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-white font-black">⚙️ Delivery Settings</h2>

        {/* Commission rates */}
        <p className="text-xs font-bold text-white/40 uppercase tracking-wide -mb-1">Commission Rates</p>
        <p className="text-white/40 text-xs">Applied to new orders only — existing orders keep the rate at the time they were created.</p>
        {CHANNEL_KEYS.map(key => (
          <label key={key} className="flex items-center gap-3">
            <span className="text-white/70 text-sm flex-1">{DELIVERY_CHANNELS[key].icon} {DELIVERY_CHANNELS[key].label}</span>
            <input
              value={rates[key]}
              onChange={e => setRates(prev => ({ ...prev, [key]: e.target.value }))}
              inputMode="numeric"
              className="w-20 bg-gray-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white text-right focus:outline-none focus:border-white/30"
            />
            <span className="text-white/40 text-sm">%</span>
          </label>
        ))}

        {/* Grab partner API */}
        <div className="border-t border-white/10 pt-3">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-bold text-white/40 uppercase tracking-wide">🟢 GrabFood API (Phase 2)</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${grabConnected ? 'bg-green-600/20 text-green-300' : 'bg-white/10 text-white/40'}`}>
              {grabConnected ? 'Configured' : 'Not configured'}
            </span>
          </div>
          <p className="text-white/40 text-xs mb-3">
            Requires GrabFood partner API access. Orders pushed by Grab appear on this board automatically;
            Accept / Ready / Cancel are relayed back to Grab.
          </p>
          <div className="flex flex-col gap-2">
            <input
              value={grabClientId}
              onChange={e => setClientId(e.target.value)}
              placeholder={grabCfg?.clientIdConfigured ? `Client ID (saved ···${grabCfg.clientIdLast4}) — type to replace` : 'Client ID'}
              className="bg-gray-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
            />
            <input
              value={grabSecret}
              onChange={e => setGrabSecret(e.target.value)}
              type="password"
              placeholder={grabCfg?.clientSecretConfigured ? 'Client Secret (saved) — type to replace' : 'Client Secret'}
              className="bg-gray-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
            />
            <input
              value={grabMerchant}
              onChange={e => setMerchant(e.target.value)}
              placeholder="Merchant ID"
              className="bg-gray-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
            />
            <input
              value={grabWebhookSecret}
              onChange={e => setWhSecret(e.target.value)}
              type="password"
              placeholder={grabCfg?.webhookSecretConfigured ? 'Webhook Secret (saved) — type to replace' : 'Webhook Secret (credential registered with Grab)'}
              className="bg-gray-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
            />
            <label className="flex items-center gap-2 text-sm text-white/70 py-1">
              <input type="checkbox" checked={grabAutoAccept} onChange={e => setAutoAccept(e.target.checked)} className="accent-green-500 w-4 h-4" />
              Auto-accept incoming Grab orders
            </label>
            <div className="flex items-center gap-2 bg-gray-800 border border-white/10 rounded-xl px-3 py-2">
              <span className="text-[11px] text-white/40 font-mono truncate flex-1">{webhookUrl}</span>
              <button
                onClick={() => { navigator.clipboard?.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                className="text-[11px] text-white/60 hover:text-white font-bold shrink-0"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[10px] text-white/30">Register this URL as your order webhook in the Grab partner portal.</p>
          </div>
        </div>

        <button onClick={save} disabled={saving} className="w-full py-3 rounded-xl bg-white text-gray-900 font-bold transition active:scale-95 disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DeliveryPage() {
  const [orders,   setOrders]   = useState<Order[]>([])
  const [menu,     setMenu]     = useState<MenuItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showEntry, setShowEntry] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<DeliverySettings>(() => loadDeliverySettings())
  const [, forceRender] = useState(0)

  const todayStr = new Date().toDateString()

  const fetchAll = useCallback(async () => {
    try {
      const [ro, rm] = await Promise.all([fetch('/api/orders'), fetch('/api/menu')])
      if (ro.ok) {
        const d = await ro.json()
        setOrders((d.orders as Order[]).filter(o => o.channel))
      }
      if (rm.ok) {
        const d = await rm.json()
        setMenu(d.menu as MenuItem[])
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, POLL_INTERVAL * 1000)
    const tick = setInterval(() => forceRender(n => n + 1), 10000)
    return () => { clearInterval(iv); clearInterval(tick) }
  }, [fetchAll])

  async function handleUpdate(order: Order, status: OrderStatus) {
    const body: Record<string, unknown> = { status }
    // Picked up = platform pays → mark paid with channel as payment method
    if (status === 'paid') body.paymentMethod = order.channel
    const r = await fetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.ok) {
      const d = await r.json()
      setOrders(prev => prev.map(o => o.id === order.id ? d.order : o))
    }
  }

  const active = orders.filter(o =>
    ACTIVE_STATUSES.includes(o.status) && new Date(o.createdAt).toDateString() === todayStr
  )
  const pending  = active.filter(o => o.status === 'pending')
  const accepted = active.filter(o => o.status === 'accepted')
  const ready    = active.filter(o => o.status === 'ready')

  // Today's per-channel summary (includes picked-up/paid orders)
  const todaySummary = useMemo(() => {
    const today = orders.filter(o =>
      new Date(o.createdAt).toDateString() === todayStr && o.status !== 'cancelled'
    )
    return CHANNEL_KEYS.map(key => {
      const chOrders = today.filter(o => o.channel === key)
      const gross = chOrders.reduce((s, o) => s + o.total, 0)
      const commission = chOrders.reduce((s, o) => s + o.total * (o.commissionRate ?? settings.commission[key]), 0)
      return { key, count: chOrders.length, gross, net: Math.round(gross - commission) }
    })
  }, [orders, todayStr, settings])

  if (loading) {
    return (
      <div className="flex-1 bg-gray-950 flex items-center justify-center">
        <div className="text-4xl animate-pulse">🛵</div>
      </div>
    )
  }

  const COLUMNS: { status: OrderStatus; icon: string; label: string; empty: string; list: Order[] }[] = [
    { status: 'pending',  icon: '🔴', label: 'New',       empty: 'No new delivery orders', list: pending },
    { status: 'accepted', icon: '🟡', label: 'Preparing', empty: 'Nothing being prepared', list: accepted },
    { status: 'ready',    icon: '🟢', label: 'Ready for pickup', empty: 'Nothing ready', list: ready },
  ]

  return (
    <div className="flex-1 bg-gray-950 text-white flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0 flex-wrap">
        <span className="text-xl">🛵</span>
        <h1 className="font-black text-base tracking-tight">Delivery Orders</h1>
        {pending.length > 0 && (
          <span className="bg-red-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full animate-pulse">
            {pending.length} new
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition"
            title="Commission settings"
          >
            ⚙️
          </button>
          <button
            onClick={() => setShowEntry(true)}
            className="bg-amber-500 hover:bg-amber-400 text-black font-black text-sm px-4 py-2 rounded-xl transition active:scale-95"
          >
            + New Order
          </button>
        </div>
      </div>

      {/* Today summary strip */}
      <div className="flex gap-2 px-4 py-3 border-b border-white/10 shrink-0 overflow-x-auto">
        {todaySummary.map(s => {
          const meta = DELIVERY_CHANNELS[s.key]
          return (
            <div key={s.key} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 shrink-0 ${meta.bgClass}`}>
              <span className="text-sm font-bold">{meta.icon} {meta.label}</span>
              <span className="text-xs opacity-80 tabular-nums">{s.count} orders</span>
              <span className="text-xs tabular-nums">gross {baht(s.gross)}</span>
              <span className="text-xs font-bold tabular-nums">net {baht(s.net)}</span>
            </div>
          )
        })}
      </div>

      {/* Board */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/5 min-h-full">
          {COLUMNS.map(col => (
            <div key={col.status} className="bg-gray-950 p-4">
              <div className="flex items-center gap-2 sticky top-0 z-10 bg-gray-950 py-2">
                <span className="text-base">{col.icon}</span>
                <h2 className="text-sm font-bold text-white/80 uppercase tracking-widest">{col.label}</h2>
                {col.list.length > 0 && (
                  <span className="ml-auto bg-white/10 text-white/60 text-xs font-bold px-2 py-0.5 rounded-full">{col.list.length}</span>
                )}
              </div>
              <div className="flex flex-col gap-3 mt-1">
                {col.list.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-white/10 p-8 text-center text-white/20 text-sm">{col.empty}</div>
                ) : (
                  col.list.map(o => <DeliveryCard key={o.id} order={o} onUpdate={handleUpdate} />)
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showEntry && (
        <QuickEntryModal
          menu={menu}
          settings={settings}
          onClose={() => setShowEntry(false)}
          onCreated={fetchAll}
        />
      )}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={(s) => { setSettings(s); saveDeliverySettings(s) }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
