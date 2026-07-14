'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Promotion, PromotionType, MenuItem } from '@/lib/types'
import { fetchCategories, type CatEntry } from '@/lib/categories'
import { isPromotionActiveNow, promotionSummary } from '@/lib/promotions'

function baht(n: number) { return '฿' + new Intl.NumberFormat('en').format(Math.round(n)) }

const TYPE_META: Record<PromotionType, { label: string; icon: string; hint: string }> = {
  bundle:    { label: 'Bundle price', icon: '📦', hint: 'Buy N of an item for a fixed total (e.g. 2 Shots = ฿250)' },
  free_item: { label: 'Buy → get free', icon: '🎁', hint: 'Buy N of an item, get something free (tag only — staff hand it out)' },
  discount:  { label: 'Item discount', icon: '🏷️', hint: '% or ฿ off an item or a whole category (e.g. happy hour)' },
}

type FormState = {
  id?: string
  name: string
  type: PromotionType
  active: boolean
  targetType: 'item' | 'category'
  targetId: string
  buyQty: string
  bundlePrice: string
  freeText: string
  discountType: 'percent' | 'fixed'
  discountValue: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  showOnQr: boolean
}

function emptyForm(): FormState {
  return {
    name: '', type: 'bundle', active: true, targetType: 'item', targetId: '',
    buyQty: '2', bundlePrice: '', freeText: '', discountType: 'percent', discountValue: '',
    startDate: '', endDate: '', startTime: '', endTime: '', showOnQr: true,
  }
}

function toForm(p: Promotion): FormState {
  return {
    id: p.id, name: p.name, type: p.type, active: p.active,
    targetType: p.targetType, targetId: p.targetId ?? '',
    buyQty: p.buyQty != null ? String(p.buyQty) : '',
    bundlePrice: p.bundlePrice != null ? String(p.bundlePrice) : '',
    freeText: p.freeText ?? '',
    discountType: p.discountType ?? 'percent',
    discountValue: p.discountValue != null ? String(p.discountValue) : '',
    startDate: p.startDate ?? '', endDate: p.endDate ?? '',
    startTime: p.startTime ?? '', endTime: p.endTime ?? '',
    showOnQr: p.showOnQr,
  }
}

export default function PromotionsManager() {
  const [promos, setPromos]     = useState<Promotion[]>([])
  const [menu, setMenu]         = useState<MenuItem[]>([])
  const [cats, setCats]         = useState<CatEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm]         = useState<FormState>(emptyForm())
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 2500) }

  const fetchAll = useCallback(async () => {
    const r = await fetch('/api/promotions').then(res => res.json()).catch(() => ({ promotions: [] }))
    setPromos(r.promotions ?? [])
  }, [])

  useEffect(() => {
    fetchAll()
    fetch('/api/menu').then(r => r.json()).then(d => setMenu(d.menu ?? [])).catch(() => {})
    fetchCategories().then(setCats).catch(() => {})
  }, [fetchAll])

  const menuById = new Map(menu.map(m => [m.id, m]))

  function startCreate() { setForm(emptyForm()); setIsCreating(true); setSelectedId(null) }
  function startEdit(p: Promotion) { setForm(toForm(p)); setSelectedId(p.id); setIsCreating(true) }
  function cancel() { setIsCreating(false); setSelectedId(null) }
  function set<K extends keyof FormState>(k: K, v: FormState[K]) { setForm(f => ({ ...f, [k]: v })) }

  function validate(): string | null {
    if (!form.name.trim()) return 'Name required'
    if (!form.targetId) return form.targetType === 'item' ? 'Pick a menu item' : 'Pick a category'
    if (form.type === 'bundle') {
      if (Number(form.buyQty) < 2) return 'Bundle quantity must be 2 or more'
      if (!(Number(form.bundlePrice) > 0)) return 'Bundle price required'
    }
    if (form.type === 'free_item') {
      if (Number(form.buyQty) < 1) return 'Buy quantity required'
      if (!form.freeText.trim()) return 'Free item text required (e.g. "Free Peanuts")'
    }
    if (form.type === 'discount') {
      if (!(Number(form.discountValue) > 0)) return 'Discount value required'
    }
    if ((form.startTime && !form.endTime) || (!form.startTime && form.endTime)) {
      return 'Set both start and end time for a daily window (or neither)'
    }
    return null
  }

  async function save() {
    const err = validate()
    if (err) { showToast(err, false); return }
    setSaving(true)
    // Bundle & free_item are always item-targeted; discount can be item or category.
    const isDiscount = form.type === 'discount'
    const body = {
      name: form.name.trim(),
      type: form.type,
      active: form.active,
      targetType: isDiscount ? form.targetType : 'item',
      targetId: form.targetId,
      buyQty: form.type !== 'discount' ? Number(form.buyQty) : null,
      bundlePrice: form.type === 'bundle' ? Number(form.bundlePrice) : null,
      freeText: form.type === 'free_item' ? form.freeText.trim() : null,
      discountType: isDiscount ? form.discountType : null,
      discountValue: isDiscount ? Number(form.discountValue) : null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      showOnQr: form.showOnQr,
    }
    try {
      const url = form.id ? `/api/promotions/${form.id}` : '/api/promotions'
      const method = form.id ? 'PATCH' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { const e = await r.json().catch(() => ({})); showToast(e.error ?? 'Save failed', false); return }
      showToast(form.id ? 'Promotion updated' : 'Promotion created')
      cancel()
      await fetchAll()
    } catch { showToast('Network error', false) } finally { setSaving(false) }
  }

  async function toggleActive(p: Promotion) {
    await fetch(`/api/promotions/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !p.active }),
    })
    await fetchAll()
  }

  async function remove(p: Promotion) {
    if (!window.confirm(`Delete promotion "${p.name}"?`)) return
    await fetch(`/api/promotions/${p.id}`, { method: 'DELETE' })
    if (selectedId === p.id) cancel()
    await fetchAll()
  }

  const now = new Date()
  const targetLabel = (p: Promotion) =>
    p.targetType === 'category'
      ? (cats.find(c => c.value === p.targetId)?.label ?? p.targetId ?? '—')
      : (menuById.get(p.targetId ?? '')?.name ?? p.targetId ?? '—')

  const timingLabel = (p: Promotion) => {
    const bits: string[] = []
    if (p.startTime && p.endTime) bits.push(`${p.startTime}–${p.endTime}`)
    if (p.startDate || p.endDate) bits.push(`${p.startDate ?? '…'} → ${p.endDate ?? '…'}`)
    return bits.join(' · ') || 'Always'
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-2xl font-semibold text-sm pointer-events-none text-white ${toast.ok ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.ok ? '✓' : '✗'} {toast.msg}
        </div>
      )}

      {/* ── Left: list ── */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-gray-200 bg-gray-50 overflow-hidden">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-600">
            {promos.filter(p => p.active).length} active · {promos.length} total
          </span>
          <button onClick={startCreate} className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold text-xs px-3 py-1.5 rounded-lg transition">
            + New Promo
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {promos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-300 text-sm gap-1">
              <span className="text-3xl">🎁</span>
              <p>No promotions yet</p>
            </div>
          ) : promos.map(p => {
            const live = isPromotionActiveNow(p, now)
            return (
              <button
                key={p.id}
                onClick={() => startEdit(p)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 transition hover:bg-gray-100 ${selectedId === p.id ? 'bg-amber-500/10 border-l-2 border-l-amber-500' : ''}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-sm truncate">{TYPE_META[p.type].icon} {p.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                    !p.active ? 'bg-gray-100 text-gray-400 border-gray-200'
                    : live ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : 'bg-amber-100 text-amber-700 border-amber-200'
                  }`}>
                    {!p.active ? 'off' : live ? 'live' : 'scheduled'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {promotionSummary(p)} · <span className="text-gray-400">{targetLabel(p)}</span>
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">⏱ {timingLabel(p)}{p.showOnQr ? ' · 📱 QR' : ''}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Right: form / empty ── */}
      {!isCreating ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-2">
          <span className="text-6xl">🎁</span>
          <p className="text-base font-semibold">Select a promotion</p>
          <p className="text-sm">or create a new one</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{form.id ? 'Edit Promotion' : 'New Promotion'}</h2>
            {form.id && (
              <button onClick={() => { const p = promos.find(x => x.id === form.id); if (p) remove(p) }}
                className="text-xs text-red-500 border border-red-100 hover:bg-red-50 px-3 py-1.5 rounded-lg transition">
                Delete
              </button>
            )}
          </div>

          {/* Type picker */}
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(TYPE_META) as PromotionType[]).map(t => (
              <button key={t} onClick={() => set('type', t)}
                className={`p-3 rounded-xl border text-left transition ${form.type === t ? 'bg-amber-50 border-amber-400' : 'bg-gray-50 border-gray-200 hover:border-gray-300'}`}>
                <div className="text-xl">{TYPE_META[t].icon}</div>
                <div className="text-xs font-bold mt-1">{TYPE_META[t].label}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 -mt-2">{TYPE_META[form.type].hint}</p>

          <Field label="Name">
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Shot Bundle, Happy Hour Cocktails"
              className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-500" />
          </Field>

          {/* Target */}
          {form.type === 'discount' && (
            <div className="flex gap-2">
              {(['item', 'category'] as const).map(tt => (
                <button key={tt} onClick={() => { set('targetType', tt); set('targetId', '') }}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition capitalize ${form.targetType === tt ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-gray-500 border-gray-200'}`}>
                  {tt === 'item' ? 'Specific item' : 'Whole category'}
                </button>
              ))}
            </div>
          )}
          <Field label={form.type === 'discount' && form.targetType === 'category' ? 'Category' : 'Menu item'}>
            <select value={form.targetId} onChange={e => set('targetId', e.target.value)}
              className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-500 appearance-none">
              <option value="">Select…</option>
              {form.type === 'discount' && form.targetType === 'category'
                ? cats.map(c => <option key={c.value} value={c.value}>{c.label}</option>)
                : menu.map(m => <option key={m.id} value={m.id}>{m.name} ({baht(m.price)})</option>)}
            </select>
          </Field>

          {/* Mechanic params */}
          {form.type === 'bundle' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Buy quantity"><NumInput value={form.buyQty} onChange={v => set('buyQty', v)} placeholder="2" /></Field>
              <Field label="Bundle price (฿)"><NumInput value={form.bundlePrice} onChange={v => set('bundlePrice', v)} placeholder="250" /></Field>
            </div>
          )}
          {form.type === 'free_item' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Buy quantity"><NumInput value={form.buyQty} onChange={v => set('buyQty', v)} placeholder="3" /></Field>
              <Field label="Free item (text)">
                <input value={form.freeText} onChange={e => set('freeText', e.target.value)} placeholder="Free Peanuts"
                  className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-500" />
              </Field>
            </div>
          )}
          {form.type === 'discount' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Discount kind">
                <div className="flex rounded-xl overflow-hidden border border-gray-200">
                  {(['percent', 'fixed'] as const).map(dt => (
                    <button key={dt} onClick={() => set('discountType', dt)}
                      className={`flex-1 py-2 text-sm font-bold transition ${form.discountType === dt ? 'bg-stone-900 text-white' : 'bg-white text-gray-400'}`}>
                      {dt === 'percent' ? '%' : '฿'}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={form.discountType === 'percent' ? 'Percent off' : '฿ off per item'}>
                <NumInput value={form.discountValue} onChange={v => set('discountValue', v)} placeholder={form.discountType === 'percent' ? '20' : '30'} />
              </Field>
            </div>
          )}

          {/* Timing */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Timing (optional — blank = always)</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Daily from"><input type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)} className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none" /></Field>
              <Field label="Daily to"><input type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)} className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none" /></Field>
              <Field label="Start date"><input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none" /></Field>
              <Field label="End date"><input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none" /></Field>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Daily window may cross midnight (e.g. 22:00 → 02:00).</p>
          </div>

          {/* Toggles */}
          <div className="flex flex-col gap-2">
            <Toggle label="Active" checked={form.active} onChange={v => set('active', v)} />
            <Toggle label="📱 Advertise in QR ordering popup" checked={form.showOnQr} onChange={v => set('showOnQr', v)} />
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={cancel} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm hover:bg-gray-200 transition">Cancel</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition active:scale-95 disabled:opacity-50">
              {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create Promotion'}
            </button>
          </div>

          {form.id && (
            <button onClick={() => { const p = promos.find(x => x.id === form.id); if (p) toggleActive(p) }}
              className="text-xs text-gray-400 hover:text-gray-600 text-center transition">
              {form.active ? 'Pause this promotion' : 'Resume this promotion'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      {children}
    </label>
  )
}

function NumInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input inputMode="decimal" value={value}
      onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
      placeholder={placeholder}
      className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-500" />
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 transition hover:border-gray-300">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <span className={`w-10 h-6 rounded-full flex items-center px-0.5 transition ${checked ? 'bg-amber-500 justify-end' : 'bg-gray-300 justify-start'}`}>
        <span className="w-5 h-5 bg-white rounded-full shadow" />
      </span>
    </button>
  )
}
