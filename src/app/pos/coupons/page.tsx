'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Coupon, CouponUse, CouponType } from '@/lib/types'
import NumPad from '@/components/pos/NumPad'
import PromotionsManager from '@/components/pos/PromotionsManager'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baht(n: number) {
  return '฿' + new Intl.NumberFormat('en').format(Math.round(n))
}

function couponStatus(c: Coupon): 'active' | 'inactive' | 'expired' | 'full' {
  if (!c.active) return 'inactive'
  const today = new Date().toISOString().slice(0, 10)
  if (c.endDate && today > c.endDate) return 'expired'
  if (c.maxUses > 0 && c.usedCount >= c.maxUses) return 'full'
  return 'active'
}

const STATUS_STYLE: Record<string, string> = {
  active:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  inactive: 'bg-gray-100 text-gray-500 border-gray-200',
  expired:  'bg-red-100 text-red-600 border-red-200',
  full:     'bg-amber-100 text-amber-700 border-amber-200',
}

const TYPE_STYLE: Record<CouponType, { label: string; color: string; icon: string }> = {
  percent: { label: '% Off', color: 'bg-gray-100 text-gray-700', icon: '🏷️' },
  fixed:   { label: '฿ Off', color: 'bg-gray-100 text-gray-700', icon: '💵' },
}

function usagePercent(c: Coupon): number {
  if (c.maxUses === 0) return Math.min(100, (c.usedCount / Math.max(c.usedCount, 50)) * 100)
  return Math.min(100, (c.usedCount / c.maxUses) * 100)
}

function emptyForm(): FormState {
  return {
    code: '', name: '', description: '', type: 'percent', value: '',
    minOrder: '', maxUses: '', active: true, memberOnly: false,
    startDate: '', endDate: '',
  }
}

type FormState = {
  code: string; name: string; description: string
  type: CouponType; value: string; minOrder: string; maxUses: string
  active: boolean; memberOnly: boolean; startDate: string; endDate: string
}

type NumPadTarget = 'value' | 'minOrder' | 'maxUses' | null

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CouponsPage() {
  const [tab, setTab] = useState<'coupons' | 'promotions'>('coupons')
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [uses, setUses] = useState<CouponUse[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all')
  const [search, setSearch] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [numPadTarget, setNumPadTarget] = useState<NumPadTarget>(null)
  const [numPadVal, setNumPadVal] = useState('')
  const [showUses, setShowUses] = useState(false)
  const [testCode, setTestCode] = useState('')
  const [testAmount, setTestAmount] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const fetchAll = useCallback(async () => {
    const r = await fetch('/api/coupons').then(res => res.json())
    setCoupons(r.coupons ?? [])
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const selected = coupons.find(c => c.id === selectedId)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  function selectCoupon(c: Coupon) {
    setSelectedId(c.id)
    setIsCreating(false)
    setForm({
      code: c.code, name: c.name, description: c.description ?? '',
      type: c.type, value: String(c.value), minOrder: c.minOrder > 0 ? String(c.minOrder) : '',
      maxUses: c.maxUses > 0 ? String(c.maxUses) : '', active: c.active, memberOnly: c.memberOnly,
      startDate: c.startDate ?? '', endDate: c.endDate ?? '',
    })
    setShowUses(false)
    fetch(`/api/coupons/${c.id}`).then(r => r.json()).then(d => setUses(d.uses ?? []))
  }

  function startCreate() {
    setSelectedId(null)
    setIsCreating(true)
    setForm(emptyForm())
    setUses([])
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim() || !form.value) {
      return showToast('Code, name, and value are required', false)
    }
    setIsSaving(true)
    try {
      const payload = {
        code: form.code.toUpperCase().trim(),
        name: form.name.trim(),
        description: form.description || undefined,
        type: form.type,
        value: Number(form.value),
        minOrder: Number(form.minOrder) || 0,
        maxUses: Number(form.maxUses) || 0,
        active: form.active,
        memberOnly: form.memberOnly,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
      }
      if (isCreating) {
        const r = await fetch('/api/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!r.ok) throw new Error((await r.json()).error)
        showToast(`Coupon ${payload.code} created`)
        setIsCreating(false)
      } else {
        const r = await fetch(`/api/coupons/${selectedId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!r.ok) throw new Error((await r.json()).error)
        showToast('Saved')
      }
      await fetchAll()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', false)
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleActive() {
    if (!selectedId || !selected) return
    await fetch(`/api/coupons/${selectedId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !selected.active }),
    })
    showToast(selected.active ? 'Coupon deactivated' : 'Coupon activated')
    await fetchAll()
    // sync form
    setForm(f => ({ ...f, active: !f.active }))
  }

  async function handleDelete() {
    if (!selectedId) return
    if (!confirm(`Delete coupon "${selected?.code}"?`)) return
    await fetch(`/api/coupons/${selectedId}`, { method: 'DELETE' })
    showToast('Deleted')
    setSelectedId(null)
    await fetchAll()
  }

  async function handleTest() {
    if (!testCode.trim()) return
    const r = await fetch('/api/coupons/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: testCode.trim(), subtotal: Number(testAmount) || 0 }),
    })
    const data = await r.json()
    if (data.valid) {
      setTestResult({ ok: true, msg: `✓ Valid! Discount: ${baht(data.discountAmount)} off ฿${testAmount}` })
    } else {
      setTestResult({ ok: false, msg: `✗ ${data.error}` })
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => showToast(`${code} copied!`)).catch(() => {})
  }

  const filtered = coupons.filter(c => {
    const st = couponStatus(c)
    if (filter !== 'all' && st !== filter) return false
    if (search && !c.code.includes(search.toUpperCase()) && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Stats
  const totalSavings = uses.reduce((s, u) => s + u.discountAmount, 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 text-gray-900">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-2xl font-semibold text-sm pointer-events-none ${toast.ok ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.ok ? '✓' : '✗'} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="px-5 pt-4 pb-3 bg-white border-b border-gray-200 shrink-0 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {(['coupons', 'promotions'] as const).map(tb => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`px-4 py-2 rounded-lg text-sm font-bold capitalize transition ${
                tab === tb ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tb === 'coupons' ? '🎟️ Coupons' : '🎁 Promotions'}
            </button>
          ))}
        </div>
        {tab === 'coupons' && (
          <button
            onClick={startCreate}
            className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold text-sm px-4 py-2 rounded-xl transition"
          >
            + New Coupon
          </button>
        )}
      </div>

      {tab === 'promotions' ? (
        <PromotionsManager />
      ) : (
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: List ── */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-gray-200 bg-gray-50 overflow-hidden">

          <div className="p-3 border-b border-gray-200 flex flex-col gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search code or name..."
              className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:ring-1 focus:ring-amber-500 transition"
            />
            <div className="flex gap-1 flex-wrap">
              {(['all', 'active', 'inactive', 'expired'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold transition capitalize ${
                    filter === f ? 'bg-amber-500/25 text-amber-400' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-gray-300 text-sm">
                <p>No coupons</p>
              </div>
            ) : (
              filtered.map(c => {
                const st = couponStatus(c)
                const tp = TYPE_STYLE[c.type]
                const pct = usagePercent(c)
                return (
                  <button
                    key={c.id}
                    onClick={() => selectCoupon(c)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 transition hover:bg-gray-100 ${
                      selectedId === c.id ? 'bg-amber-500/10 border-l-2 border-l-amber-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1 gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-xs px-2 py-0.5 rounded font-bold font-mono shrink-0 ${tp.color}`}>
                          {c.code}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold shrink-0 ${STATUS_STYLE[st]}`}>
                        {st}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate mb-1.5">{c.name}</p>
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>{tp.icon} {c.type === 'percent' ? `${c.value}% off` : `฿${c.value} off`}</span>
                      <span>{c.usedCount}{c.maxUses > 0 ? `/${c.maxUses}` : ''} uses</span>
                    </div>
                    {/* Usage bar */}
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* ── Right: Detail / Form ── */}
        {!selectedId && !isCreating ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
            <p className="text-6xl mb-4">🎟️</p>
            <p className="text-base font-semibold">Select a coupon</p>
            <p className="text-sm mt-1">or create a new one</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

            {/* Title row */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold font-mono">
                  {isCreating ? 'New Coupon' : selected?.code}
                </h2>
                {!isCreating && selected && (
                  <p className="text-sm text-gray-500 mt-0.5">{selected.name}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isCreating && selected && (
                  <>
                    <button
                      onClick={() => copyCode(selected.code)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 font-semibold transition"
                    >
                      📋 Copy
                    </button>
                    <button
                      onClick={toggleActive}
                      className={`text-xs px-3 py-1.5 rounded-lg font-bold transition ${
                        selected.active
                          ? 'bg-red-100 text-red-600 hover:bg-red-200'
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      }`}
                    >
                      {selected.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={handleDelete}
                      className="text-xs text-gray-400 hover:text-red-400 transition px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-400/30"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Stats (view only) */}
            {!isCreating && selected && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
                  <p className="text-2xl font-black text-gray-900">{selected.usedCount}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {selected.maxUses > 0 ? `of ${selected.maxUses} uses` : 'total uses'}
                  </p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
                  <p className="text-2xl font-black text-gray-900">{baht(totalSavings)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">total savings given</p>
                </div>
                <div className={`rounded-2xl border p-3 text-center ${STATUS_STYLE[couponStatus(selected)]}`}>
                  <p className="text-lg font-black capitalize">{couponStatus(selected)}</p>
                  <p className="text-xs mt-0.5 opacity-70">
                    {selected.type === 'percent' ? `${selected.value}% off` : `฿${selected.value} off`}
                    {selected.minOrder > 0 ? ` · min ฿${selected.minOrder}` : ''}
                  </p>
                </div>
              </div>
            )}

            {/* Usage bar (extended view) */}
            {!isCreating && selected && selected.maxUses > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3">
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>Usage</span>
                  <span>{selected.usedCount} / {selected.maxUses}</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${usagePercent(selected) >= 100 ? 'bg-red-500' : usagePercent(selected) > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${usagePercent(selected)}%` }}
                  />
                </div>
                {selected.maxUses - selected.usedCount <= 5 && selected.usedCount < selected.maxUses && (
                  <p className="text-xs text-amber-400 mt-1.5">⚠ Only {selected.maxUses - selected.usedCount} uses remaining</p>
                )}
              </div>
            )}

            {/* Edit / Create form */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex flex-col gap-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {isCreating ? 'Coupon Details' : 'Edit Coupon'}
              </h3>

              {/* Code */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Coupon Code * (auto-uppercase)</label>
                <input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') }))}
                  placeholder="e.g. HAPPY10"
                  className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-gray-900 tracking-widest outline-none focus:border-amber-500/60 transition"
                />
              </div>

              {/* Name */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Display Name *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Happy Hour Discount"
                  className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-500/60 transition"
                />
              </div>

              {/* Type + Value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Type</label>
                  <div className="flex rounded-xl overflow-hidden border border-gray-200">
                    {(['percent', 'fixed'] as CouponType[]).map(t => (
                      <button
                        key={t}
                        onClick={() => setForm(f => ({ ...f, type: t }))}
                        className={`flex-1 py-2.5 text-sm font-bold transition ${form.type === t ? 'bg-amber-500 text-black' : 'bg-gray-100 text-gray-400 hover:text-gray-600'}`}
                      >
                        {t === 'percent' ? '% Off' : '฿ Off'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    Value {form.type === 'percent' ? '(%)' : '(฿)'} *
                  </label>
                  <button
                    onClick={() => { setNumPadVal(form.value); setNumPadTarget('value') }}
                    className={`w-full text-left bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-lg font-black hover:border-amber-500/40 transition ${form.value ? 'text-gray-900' : 'text-gray-400'}`}
                  >
                    {form.value ? (form.type === 'percent' ? `${form.value}%` : `฿${form.value}`) : 'Tap to set'}
                  </button>
                </div>
              </div>

              {/* Min Order + Max Uses */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Min Order (฿, 0 = none)</label>
                  <button
                    onClick={() => { setNumPadVal(form.minOrder); setNumPadTarget('minOrder') }}
                    className={`w-full text-left bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm hover:border-amber-500/40 transition ${form.minOrder ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}
                  >
                    {form.minOrder ? `฿${form.minOrder}` : 'No minimum'}
                  </button>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Max Uses (0 = unlimited)</label>
                  <button
                    onClick={() => { setNumPadVal(form.maxUses); setNumPadTarget('maxUses') }}
                    className={`w-full text-left bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm hover:border-amber-500/40 transition ${form.maxUses ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}
                  >
                    {form.maxUses ? `${form.maxUses} uses` : 'Unlimited'}
                  </button>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Start Date (optional)</label>
                  <input type="date" value={form.startDate}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-500/60 transition"
                    style={{ colorScheme: 'dark' }} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">End Date (optional)</label>
                  <input type="date" value={form.endDate}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-500/60 transition"
                    style={{ colorScheme: 'dark' }} />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex gap-3">
                <Toggle
                  label="Active"
                  value={form.active}
                  onChange={v => setForm(f => ({ ...f, active: v }))}
                  onColor="bg-emerald-600"
                />
                <Toggle
                  label="Members Only"
                  value={form.memberOnly}
                  onChange={v => setForm(f => ({ ...f, memberOnly: v }))}
                  onColor="bg-blue-600"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Description (optional)</label>
                <input value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Internal note..."
                  className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-500/60 transition" />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : isCreating ? 'Create Coupon' : 'Save Changes'}
                </button>
                {isCreating && (
                  <button
                    onClick={() => { setIsCreating(false); setSelectedId(null) }}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-900 font-semibold text-sm transition"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Coupon Tester */}
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">🧪 Coupon Tester</h3>
              <div className="flex gap-2 mb-2">
                <input
                  value={testCode}
                  onChange={e => { setTestCode(e.target.value.toUpperCase()); setTestResult(null) }}
                  placeholder="Enter code..."
                  className="flex-1 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono font-bold text-gray-900 outline-none focus:border-amber-500/60 transition"
                />
                <input
                  value={testAmount}
                  onChange={e => { setTestAmount(e.target.value); setTestResult(null) }}
                  placeholder="฿ amount"
                  className="w-24 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 outline-none focus:border-amber-500/60 transition"
                />
                <button
                  onClick={handleTest}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-bold text-gray-600 hover:text-gray-900 transition active:scale-95"
                >
                  Test
                </button>
              </div>
              {testResult && (
                <p className={`text-sm font-semibold px-3 py-2 rounded-xl ${testResult.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                  {testResult.msg}
                </p>
              )}
            </div>

            {/* Usage history */}
            {!isCreating && uses.length > 0 && (
              <div>
                <button
                  onClick={() => setShowUses(v => !v)}
                  className="w-full text-left text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center justify-between py-1"
                >
                  <span>Recent Uses ({uses.length})</span>
                  <span>{showUses ? '▲' : '▼'}</span>
                </button>
                {showUses && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {uses.map(u => (
                      <div key={u.id} className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
                        <div>
                          {u.memberName && <p className="text-xs font-semibold text-gray-600">👤 {u.memberName}</p>}
                          <p className="text-xs text-gray-400">
                            {new Date(u.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-gray-900">-{baht(u.discountAmount)}</p>
                          <p className="text-xs text-gray-400">order {baht(u.orderTotal)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>
      )}

      {/* NumPads */}
      {numPadTarget === 'value' && (
        <NumPad
          label={form.type === 'percent' ? 'Discount Value (%)' : 'Discount Value (฿)'}
          value={numPadVal}
          onChange={v => { setNumPadVal(v); setForm(f => ({ ...f, value: v })) }}
          onClose={() => setNumPadTarget(null)}
          allowDecimal={form.type === 'percent'}
          suffix={form.type === 'percent' ? '%' : '฿'}
        />
      )}
      {numPadTarget === 'minOrder' && (
        <NumPad
          label="Minimum Order (฿)"
          value={numPadVal}
          onChange={v => { setNumPadVal(v); setForm(f => ({ ...f, minOrder: v })) }}
          onClose={() => setNumPadTarget(null)}
          allowDecimal={false}
          suffix="฿"
        />
      )}
      {numPadTarget === 'maxUses' && (
        <NumPad
          label="Maximum Uses (0 = unlimited)"
          value={numPadVal}
          onChange={v => { setNumPadVal(v); setForm(f => ({ ...f, maxUses: v })) }}
          onClose={() => setNumPadTarget(null)}
          allowDecimal={false}
          suffix="uses"
        />
      )}
    </div>
  )
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ label, value, onChange, onColor }: { label: string; value: boolean; onChange: (v: boolean) => void; onColor: string }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center gap-2 flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 transition hover:bg-gray-100"
    >
      <div className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${value ? onColor : 'bg-gray-300'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${value ? 'left-4' : 'left-0.5'}`} />
      </div>
      <span className="text-xs font-semibold text-gray-700">{label}</span>
    </button>
  )
}
