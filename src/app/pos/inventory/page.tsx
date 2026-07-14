'use client'

import { useState, useEffect, useCallback } from 'react'
import type { InventoryItem, StockAdjustment, InventoryCategory, AdjustReason } from '@/lib/types'
import NumPad from '@/components/pos/NumPad'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stockStatus(item: InventoryItem): 'out' | 'low' | 'ok' | 'good' {
  if (item.currentStock === 0) return 'out'
  if (item.currentStock <= item.lowStockThreshold) return 'low'
  if (item.currentStock <= item.lowStockThreshold * 1.5) return 'ok'
  return 'good'
}

const STATUS_COLOR: Record<string, string> = {
  out:  'bg-red-100 text-red-600 border border-red-200',
  low:  'bg-amber-100 text-amber-700 border border-amber-300',
  ok:   'bg-yellow-100 text-yellow-700 border border-yellow-300',
  good: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
}

const STATUS_BAR: Record<string, string> = {
  out:  'bg-red-500',
  low:  'bg-amber-500',
  ok:   'bg-yellow-400',
  good: 'bg-emerald-500',
}

const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  spirits:  '🥃 Spirits',
  beer:     '🍺 Beer',
  mixer:    '🧃 Mixers',
  food:     '🍗 Food',
  supplies: '📦 Supplies',
  other:    '🔖 Other',
}

const CATEGORIES: InventoryCategory[] = ['spirits', 'beer', 'mixer', 'food', 'supplies', 'other']

function baht(n: number) {
  return '฿' + new Intl.NumberFormat('en').format(Math.round(n))
}

function emptyForm() {
  return { name: '', unit: 'bottle', category: 'spirits' as InventoryCategory, currentStock: '0', lowStockThreshold: '5', costPerUnit: '', notes: '' }
}

function exportCSV(items: InventoryItem[]) {
  const header = 'Name,Category,Unit,Stock,Threshold,Status,Cost/Unit,Total Value'
  const rows = items.map(i => {
    const st = stockStatus(i)
    const val = i.costPerUnit ? i.currentStock * i.costPerUnit : ''
    return [i.name, i.category, i.unit, i.currentStock, i.lowStockThreshold, st, i.costPerUnit ?? '', val].join(',')
  })
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Stock Bar ────────────────────────────────────────────────────────────────

function StockBar({ item }: { item: InventoryItem }) {
  const st = stockStatus(item)
  const max = Math.max(item.currentStock, item.lowStockThreshold * 2, 1)
  const pct = Math.min(100, (item.currentStock / max) * 100)
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${STATUS_BAR[st]}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ─── Reason Label ─────────────────────────────────────────────────────────────

const REASON_LABELS: Record<AdjustReason, { label: string; color: string }> = {
  restock: { label: '+Restock', color: 'text-emerald-600' },
  usage:   { label: 'Usage',    color: 'text-blue-600' },
  manual:  { label: 'Manual',   color: 'text-gray-500' },
  waste:   { label: 'Waste',    color: 'text-red-600' },
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<InventoryCategory | 'all' | 'low'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [numPadTarget, setNumPadTarget] = useState<'add' | 'remove' | 'stock' | 'threshold' | 'cost' | null>(null)
  const [numPadVal, setNumPadVal] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [showLog, setShowLog] = useState(false)

  const fetchAll = useCallback(async () => {
    const r = await fetch('/api/inventory').then(res => res.json())
    setItems(r.items ?? [])
  }, [])

  const fetchAdjustments = useCallback(async (id: string) => {
    const r = await fetch(`/api/inventory/${id}/adjust`).then(res => res.json())
    setAdjustments(r.adjustments ?? [])
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const selected = items.find(i => i.id === selectedId)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  function selectItem(item: InventoryItem) {
    setSelectedId(item.id)
    setIsCreating(false)
    setForm({
      name: item.name,
      unit: item.unit,
      category: item.category,
      currentStock: String(item.currentStock),
      lowStockThreshold: String(item.lowStockThreshold),
      costPerUnit: item.costPerUnit ? String(item.costPerUnit) : '',
      notes: item.notes ?? '',
    })
    setShowLog(false)
    fetchAdjustments(item.id)
  }

  function startCreate() {
    setSelectedId(null)
    setIsCreating(true)
    setForm(emptyForm())
  }

  async function handleSave() {
    if (!form.name.trim()) return showToast('Name is required', false)
    setIsSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        unit: form.unit,
        category: form.category,
        currentStock: Number(form.currentStock) || 0,
        lowStockThreshold: Number(form.lowStockThreshold) || 5,
        costPerUnit: form.costPerUnit ? Number(form.costPerUnit) : undefined,
        notes: form.notes || undefined,
      }
      if (isCreating) {
        const r = await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!r.ok) throw new Error((await r.json()).error)
        showToast(`${form.name} added`)
        setIsCreating(false)
      } else {
        const r = await fetch(`/api/inventory/${selectedId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
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

  async function handleDelete() {
    if (!selectedId) return
    const item = items.find(i => i.id === selectedId)
    if (!confirm(`Delete "${item?.name}"?`)) return
    await fetch(`/api/inventory/${selectedId}`, { method: 'DELETE' })
    showToast('Deleted')
    setSelectedId(null)
    await fetchAll()
  }

  async function doAdjust(delta: number, reason: AdjustReason) {
    if (!selectedId || delta === 0) return
    const r = await fetch(`/api/inventory/${selectedId}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta, reason, note: adjustNote || undefined }),
    })
    const data = await r.json()
    if (!r.ok) return showToast(data.error, false)
    showToast(`${delta > 0 ? '+' : ''}${delta} ${selected?.unit ?? ''}`)
    setAdjustNote('')
    await fetchAll()
    setAdjustments(data.adjustments ?? [])
    // update form stock display
    if (data.item) setForm(f => ({ ...f, currentStock: String(data.item.currentStock) }))
  }

  // Filter logic
  const lowItems = items.filter(i => stockStatus(i) === 'low' || stockStatus(i) === 'out')

  const filtered = items.filter(i => {
    if (catFilter === 'low') return stockStatus(i) === 'low' || stockStatus(i) === 'out'
    if (catFilter !== 'all' && i.category !== catFilter) return false
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Stock value totals
  const totalValue = items.reduce((s, i) => s + (i.costPerUnit ?? 0) * i.currentStock, 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 text-gray-900">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-2xl font-semibold text-sm pointer-events-none ${toast.ok ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.ok ? '✓' : '✗'} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="px-5 pt-4 pb-3 bg-white border-b border-gray-200 shrink-0 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Inventory</h1>
          <p className="text-xs text-gray-500 mt-0.5">{items.length} items · stock value {baht(totalValue)}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportCSV(items)}
            className="text-xs px-3 py-2 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-400 font-semibold transition active:scale-95"
          >
            ⬇ Export CSV
          </button>
          <button
            onClick={startCreate}
            className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold text-sm px-4 py-2 rounded-xl transition"
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Low-stock alert banner */}
      {lowItems.length > 0 && (
        <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-amber-700 text-sm font-semibold shrink-0">⚠ Low stock:</span>
            {lowItems.map(i => (
              <button
                key={i.id}
                onClick={() => selectItem(i)}
                className={`text-xs rounded-full px-3 py-1 border font-semibold whitespace-nowrap transition hover:opacity-80 ${STATUS_COLOR[stockStatus(i)]}`}
              >
                {i.name} ({i.currentStock} {i.unit})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Item List ── */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-gray-200 bg-gray-50 overflow-hidden">

          {/* Search */}
          <div className="p-3 border-b border-gray-200">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search items..."
              className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:ring-1 focus:ring-amber-500 transition"
            />
          </div>

          {/* Category filter */}
          <div className="px-3 pb-2 border-b border-gray-200 flex flex-wrap gap-1 pt-2">
            {(['all', 'low', ...CATEGORIES] as const).map(c => (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                className={`text-xs px-2.5 py-1 rounded-full font-semibold transition ${
                  catFilter === c
                    ? c === 'low' ? 'bg-red-500/30 text-red-300' : 'bg-amber-500/25 text-amber-400'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {c === 'all' ? 'All' : c === 'low' ? `⚠ Low (${lowItems.length})` : CATEGORY_LABELS[c].split(' ')[1]}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-gray-300 text-sm">
                <p>{search ? 'No results' : 'No items'}</p>
              </div>
            ) : (
              filtered.map(item => {
                const st = stockStatus(item)
                return (
                  <button
                    key={item.id}
                    onClick={() => selectItem(item)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 transition hover:bg-gray-100 ${
                      selectedId === item.id ? 'bg-amber-500/10 border-l-2 border-l-amber-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm truncate pr-2">{item.name}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_COLOR[st]}`}>
                        {item.currentStock}{' '}{item.unit}
                      </span>
                    </div>
                    <StockBar item={item} />
                    <p className="text-xs text-gray-400 mt-1">{CATEGORY_LABELS[item.category]} · min {item.lowStockThreshold}</p>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* ── Right: Detail ── */}
        {!selectedId && !isCreating ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
            <p className="text-6xl mb-4">📦</p>
            <p className="text-base font-semibold">Select an item</p>
            <p className="text-sm mt-1">or add a new one</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

            {/* Title */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">{isCreating ? 'New Item' : selected?.name}</h2>
                {!isCreating && selected && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {CATEGORY_LABELS[selected.category]} · {selected.unit}
                    {selected.costPerUnit ? ` · ${baht(selected.costPerUnit)}/unit` : ''}
                  </p>
                )}
              </div>
              {!isCreating && (
                <button onClick={handleDelete} className="text-xs text-gray-400 hover:text-red-400 transition px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-400/30">
                  Delete
                </button>
              )}
            </div>

            {/* Stock overview */}
            {!isCreating && selected && (() => {
              const st = stockStatus(selected)
              const totalVal = selected.costPerUnit ? selected.currentStock * selected.costPerUnit : null
              return (
                <div className="grid grid-cols-3 gap-3">
                  <div className={`col-span-1 rounded-2xl border p-4 text-center ${STATUS_COLOR[st]}`}>
                    <p className="text-3xl font-black">{selected.currentStock}</p>
                    <p className="text-xs mt-1 opacity-70">{selected.unit} on hand</p>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-2xl p-4 text-center">
                    <p className="text-3xl font-black text-gray-600">{selected.lowStockThreshold}</p>
                    <p className="text-xs text-gray-400 mt-1">alert threshold</p>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-2xl p-4 text-center">
                    <p className="text-lg font-black text-amber-400">{totalVal !== null ? baht(totalVal) : '—'}</p>
                    <p className="text-xs text-gray-400 mt-1">stock value</p>
                  </div>
                </div>
              )
            })()}

            {/* Quick Adjust */}
            {!isCreating && selected && (
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Quick Adjust Stock</p>

                {/* Preset buttons */}
                <div className="flex gap-2 mb-3 flex-wrap">
                  {[1, 5, 10, 24].map(n => (
                    <button key={n} onClick={() => doAdjust(+n, 'restock')}
                      className="flex-1 min-w-[3rem] py-2 text-sm font-bold rounded-xl bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/70 transition active:scale-95">
                      +{n}
                    </button>
                  ))}
                  <button onClick={() => { setNumPadVal(''); setNumPadTarget('add') }}
                    className="flex-1 min-w-[3rem] py-2 text-sm font-bold rounded-xl bg-amber-100 text-amber-700 hover:bg-amber-200 transition active:scale-95">
                    +?
                  </button>
                </div>
                <div className="flex gap-2 mb-3 flex-wrap">
                  {[1, 2, 5].map(n => (
                    <button key={n} onClick={() => doAdjust(-n, 'usage')}
                      className="flex-1 min-w-[3rem] py-2 text-sm font-bold rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-100 transition active:scale-95">
                      −{n}
                    </button>
                  ))}
                  <button onClick={() => doAdjust(-1, 'waste')}
                    className="flex-1 min-w-[3rem] py-2 text-sm font-bold rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition active:scale-95">
                    🗑 Waste
                  </button>
                  <button onClick={() => { setNumPadVal(''); setNumPadTarget('remove') }}
                    className="flex-1 min-w-[3rem] py-2 text-sm font-bold rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-100 transition active:scale-95">
                    −?
                  </button>
                </div>

                {/* Note */}
                <input
                  value={adjustNote}
                  onChange={e => setAdjustNote(e.target.value)}
                  placeholder="Note (optional)..."
                  className="w-full bg-gray-100/50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-amber-500/40 transition"
                />
              </div>
            )}

            {/* Adjustment Log toggle */}
            {!isCreating && adjustments.length > 0 && (
              <div>
                <button
                  onClick={() => setShowLog(v => !v)}
                  className="w-full text-left text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center justify-between py-1"
                >
                  <span>Adjustment Log ({adjustments.length})</span>
                  <span>{showLog ? '▲' : '▼'}</span>
                </button>
                {showLog && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {adjustments.map(adj => {
                      const info = REASON_LABELS[adj.reason]
                      return (
                        <div key={adj.id} className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
                          <div>
                            <span className={`text-xs font-bold ${info.color}`}>{info.label}</span>
                            {adj.note && <span className="text-xs text-gray-400 ml-2">{adj.note}</span>}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`font-bold text-sm ${adj.delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {adj.delta > 0 ? '+' : ''}{adj.delta}
                            </span>
                            <span className="text-xs text-gray-400">
                              {new Date(adj.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Edit / Create form */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex flex-col gap-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {isCreating ? 'Item Details' : 'Edit Item'}
              </h3>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Rum (Bacardi)"
                  className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-500/60 transition" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Unit</label>
                  <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-500/60 transition">
                    {['bottle', 'can', 'pcs', 'kg', 'liter', 'portion', 'bag', 'box'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as InventoryCategory }))}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-500/60 transition">
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Current Stock</label>
                  <button
                    type="button"
                    onClick={() => { setNumPadVal(form.currentStock); setNumPadTarget('stock') }}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 text-left hover:border-amber-500/40 transition"
                  >
                    {form.currentStock || '0'}
                  </button>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Alert Threshold</label>
                  <button
                    type="button"
                    onClick={() => { setNumPadVal(form.lowStockThreshold); setNumPadTarget('threshold') }}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 text-left hover:border-amber-500/40 transition"
                  >
                    {form.lowStockThreshold || '5'}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Cost per Unit (฿)</label>
                <button
                  type="button"
                  onClick={() => { setNumPadVal(form.costPerUnit); setNumPadTarget('cost') }}
                  className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-left hover:border-amber-500/40 transition"
                >
                  <span className={form.costPerUnit ? 'text-gray-900' : 'text-gray-300'}>
                    {form.costPerUnit || 'Optional — for stock valuation'}
                  </span>
                </button>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Brand, supplier notes..."
                  className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-500/60 transition" />
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={handleSave} disabled={isSaving}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition active:scale-95 disabled:opacity-50">
                  {isSaving ? 'Saving...' : isCreating ? 'Add Item' : 'Save Changes'}
                </button>
                {isCreating && (
                  <button onClick={() => { setIsCreating(false); setSelectedId(null) }}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-400 font-semibold text-sm transition">
                    Cancel
                  </button>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* NumPads */}
      {numPadTarget === 'add' && (
        <NumPad label={`Restock ${selected?.name ?? ''}`} value={numPadVal} onChange={setNumPadVal} allowDecimal={false} suffix={selected?.unit ?? ''}
          onClose={() => { setNumPadTarget(null); const n = parseInt(numPadVal); if (n > 0) doAdjust(+n, 'restock') }} />
      )}
      {numPadTarget === 'remove' && (
        <NumPad label={`Remove ${selected?.name ?? ''}`} value={numPadVal} onChange={setNumPadVal} allowDecimal={false} suffix={selected?.unit ?? ''}
          onClose={() => { setNumPadTarget(null); const n = parseInt(numPadVal); if (n > 0) doAdjust(-n, 'manual') }} />
      )}
      {numPadTarget === 'stock' && (
        <NumPad label="Current Stock" value={numPadVal} onChange={v => { setNumPadVal(v); setForm(f => ({ ...f, currentStock: v })) }} allowDecimal={false} suffix={form.unit}
          onClose={() => setNumPadTarget(null)} />
      )}
      {numPadTarget === 'threshold' && (
        <NumPad label="Alert Threshold" value={numPadVal} onChange={v => { setNumPadVal(v); setForm(f => ({ ...f, lowStockThreshold: v })) }} allowDecimal={false} suffix={form.unit}
          onClose={() => setNumPadTarget(null)} />
      )}
      {numPadTarget === 'cost' && (
        <NumPad label="Cost per Unit (฿)" value={numPadVal} onChange={v => { setNumPadVal(v); setForm(f => ({ ...f, costPerUnit: v })) }} allowDecimal={false} suffix="฿"
          onClose={() => setNumPadTarget(null)} />
      )}
    </div>
  )
}
