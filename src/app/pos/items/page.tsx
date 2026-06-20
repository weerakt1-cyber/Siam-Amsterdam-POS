'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { MenuItem, MenuCategory, Variant, VariantOption } from '@/lib/types'
import NumPad from '@/components/pos/NumPad'

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: { value: MenuCategory | 'all'; label: string; color: string }[] = [
  { value: 'all',      label: 'All',      color: 'bg-gray-200 text-gray-700' },
  { value: 'cocktail', label: 'Cocktail', color: 'bg-purple-600 text-gray-900' },
  { value: 'beer',     label: 'Beer',     color: 'bg-amber-600 text-gray-900' },
  { value: 'drink',    label: 'Drink',    color: 'bg-cyan-600 text-gray-900' },
  { value: 'snack',    label: 'Snack',    color: 'bg-lime-600 text-gray-900' },
  { value: 'food',     label: 'Food',     color: 'bg-red-600 text-gray-900' },
  { value: 'shot',     label: 'Shot',     color: 'bg-orange-600 text-gray-900' },
  { value: 'other',    label: 'Other',    color: 'bg-gray-300 text-gray-700' },
]

const CAT_BADGE: Record<MenuCategory, string> = {
  cocktail: 'bg-purple-900/60 text-purple-300',
  beer:     'bg-amber-900/60  text-amber-300',
  drink:    'bg-cyan-900/60   text-cyan-300',
  snack:    'bg-lime-900/60   text-lime-300',
  food:     'bg-red-900/60    text-red-300',
  shot:     'bg-orange-900/60 text-orange-300',
  other:    'bg-gray-100     text-gray-400',
}

const UNITS = ['glass', 'bottle', 'draft', 'can', 'shot', 'piece', 'plate', 'set', 'portion']

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'items' | 'coupons'

type FormState = {
  name: string
  nameTh: string
  sku: string
  description: string
  category: MenuCategory
  price: string
  cost: string
  unit: string
  taxRate: string
  available: boolean
  image: string
  variants: Variant[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyForm(): FormState {
  return {
    name: '', nameTh: '', sku: '', description: '',
    category: 'cocktail', price: '', cost: '', unit: 'glass',
    taxRate: '7', available: true, image: '', variants: [],
  }
}

function itemToForm(item: MenuItem): FormState {
  return {
    name: item.name,
    nameTh: item.nameTh ?? '',
    sku: item.sku ?? '',
    description: item.description ?? '',
    category: item.category,
    price: String(item.price),
    cost: item.cost != null ? String(item.cost) : '',
    unit: item.unit ?? 'glass',
    taxRate: item.taxRate != null ? String(item.taxRate) : '7',
    available: item.available,
    image: item.image ?? '',
    variants: item.variants ? JSON.parse(JSON.stringify(item.variants)) : [],
  }
}

function margin(price: string, cost: string): number | null {
  const p = parseFloat(price), c = parseFloat(cost)
  if (!p || !c || c >= p) return null
  return Math.round(((p - c) / p) * 100)
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 480
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.72))
    }
    img.onerror = reject
    img.src = url
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MarginPill({ price, cost }: { price: string; cost: string }) {
  const m = margin(price, cost)
  if (m === null) return null
  const color = m >= 65 ? 'text-emerald-400' : m >= 40 ? 'text-amber-400' : 'text-red-400'
  return (
    <span className={`text-xs font-bold ${color}`}>
      {m}% margin
    </span>
  )
}

function VariantEditor({
  variants,
  onChange,
}: {
  variants: Variant[]
  onChange: (v: Variant[]) => void
}) {
  function addGroup() {
    onChange([...variants, { id: uid(), name: 'Option group', required: false, options: [] }])
  }

  function removeGroup(gid: string) {
    onChange(variants.filter((v) => v.id !== gid))
  }

  function updateGroup(gid: string, patch: Partial<Variant>) {
    onChange(variants.map((v) => (v.id === gid ? { ...v, ...patch } : v)))
  }

  function addOption(gid: string) {
    onChange(
      variants.map((v) =>
        v.id === gid
          ? { ...v, options: [...v.options, { id: uid(), name: '', priceAdjust: 0 }] }
          : v
      )
    )
  }

  function updateOption(gid: string, oid: string, patch: Partial<VariantOption>) {
    onChange(
      variants.map((v) =>
        v.id === gid
          ? { ...v, options: v.options.map((o) => (o.id === oid ? { ...o, ...patch } : o)) }
          : v
      )
    )
  }

  function removeOption(gid: string, oid: string) {
    onChange(
      variants.map((v) =>
        v.id === gid ? { ...v, options: v.options.filter((o) => o.id !== oid) } : v
      )
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {variants.map((v) => (
        <div key={v.id} className="bg-gray-100 border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
          {/* Group header */}
          <div className="flex items-center gap-2">
            <input
              value={v.name}
              onChange={(e) => updateGroup(v.id, { name: e.target.value })}
              placeholder="Group name (e.g. Size)"
              className="flex-1 bg-gray-100 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-900 outline-none focus:ring-1 focus:ring-amber-500"
            />
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={v.required}
                onChange={(e) => updateGroup(v.id, { required: e.target.checked })}
                className="accent-amber-500 w-3.5 h-3.5"
              />
              Required
            </label>
            <button
              onClick={() => removeGroup(v.id)}
              className="w-7 h-7 rounded-lg bg-red-900/40 hover:bg-red-700/60 text-red-400 hover:text-white flex items-center justify-center text-base transition shrink-0"
            >
              ×
            </button>
          </div>

          {/* Options */}
          <div className="flex flex-col gap-2">
            {v.options.map((opt) => (
              <div key={opt.id} className="flex items-center gap-2">
                <span className="text-gray-400 text-sm shrink-0">◦</span>
                <input
                  value={opt.name}
                  onChange={(e) => updateOption(v.id, opt.id, { name: e.target.value })}
                  placeholder="Option name"
                  className="flex-1 bg-gray-100 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-amber-500"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-gray-400">฿</span>
                  <input
                    type="number"
                    value={opt.priceAdjust === 0 ? '' : opt.priceAdjust}
                    onChange={(e) =>
                      updateOption(v.id, opt.id, { priceAdjust: Number(e.target.value) || 0 })
                    }
                    placeholder="0"
                    className="w-20 bg-gray-100 rounded-lg px-2 py-1.5 text-sm text-right text-gray-900 outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <button
                  onClick={() => removeOption(v.id, opt.id)}
                  className="w-6 h-6 rounded-md bg-slate-600 hover:bg-red-700/60 text-gray-500 hover:text-white flex items-center justify-center text-xs transition shrink-0"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => addOption(v.id)}
            className="text-xs text-amber-500/70 hover:text-amber-400 transition text-left"
          >
            + Add option
          </button>
        </div>
      ))}

      <button
        onClick={addGroup}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-dashed border-gray-200 hover:border-amber-300 rounded-xl px-4 py-3 transition"
      >
        <span className="text-lg leading-none">+</span>
        Add variant group
      </button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ItemsPage() {
  const [tab, setTab] = useState<Tab>('items')
  const [items, setItems] = useState<MenuItem[]>([])
  const [filterCat, setFilterCat] = useState<MenuCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [numPadTarget, setNumPadTarget] = useState<'price' | 'cost' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchMenu = useCallback(async () => {
    const r = await fetch('/api/menu')
    if (r.ok) {
      const d = await r.json()
      setItems(d.menu ?? [])
    }
  }, [])

  useEffect(() => { fetchMenu() }, [fetchMenu])

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  function selectItem(item: MenuItem) {
    setSelectedId(item.id)
    setIsCreating(false)
    setForm(itemToForm(item))
  }

  function startCreate() {
    setSelectedId(null)
    setIsCreating(true)
    setForm(emptyForm())
  }

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }))
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await compressImage(file)
      setField('image', dataUrl)
    } catch {
      showToast('Image upload failed', false)
    }
    e.target.value = ''
  }

  async function toggleAvailable(item: MenuItem) {
    await fetch(`/api/menu/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: !item.available }),
    })
    fetchMenu()
    if (selectedId === item.id) setField('available', !item.available)
  }

  async function handleSave() {
    if (!form.name.trim()) return showToast('Name is required', false)
    if (!form.price || isNaN(Number(form.price))) return showToast('Valid price is required', false)

    const payload = {
      name: form.name.trim(),
      nameTh: form.nameTh.trim(),
      sku: form.sku.trim(),
      description: form.description.trim(),
      category: form.category,
      price: Number(form.price),
      cost: form.cost ? Number(form.cost) : undefined,
      unit: form.unit,
      taxRate: Number(form.taxRate),
      available: form.available,
      image: form.image || undefined,
      variants: form.variants,
    }

    setIsSaving(true)
    try {
      if (isCreating) {
        const r = await fetch('/api/menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) throw new Error((await r.json()).error)
        const d = await r.json()
        showToast(`"${d.item.name}" created`)
        await fetchMenu()
        setSelectedId(d.item.id)
        setIsCreating(false)
        setForm(itemToForm(d.item))
      } else if (selectedId) {
        const r = await fetch(`/api/menu/${selectedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) throw new Error((await r.json()).error)
        showToast('Changes saved')
        await fetchMenu()
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', false)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedId) return
    const item = items.find((i) => i.id === selectedId)
    if (!confirm(`Delete "${item?.name}"? This cannot be undone.`)) return

    setIsDeleting(true)
    try {
      const r = await fetch(`/api/menu/${selectedId}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json()).error)
      showToast(`"${item?.name}" deleted`)
      setSelectedId(null)
      setIsCreating(false)
      await fetchMenu()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', false)
    } finally {
      setIsDeleting(false)
    }
  }

  const filtered = items.filter((item) => {
    const matchCat = filterCat === 'all' || item.category === filterCat
    const q = search.toLowerCase()
    const matchSearch = !q || item.name.toLowerCase().includes(q) || item.nameTh?.includes(q) || item.sku?.toLowerCase().includes(q)
    return matchCat && matchSearch
  })

  const selectedItem = items.find((i) => i.id === selectedId)
  const showEditor = isCreating || !!selectedId
  const m = margin(form.price, form.cost)

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden bg-gray-50 text-gray-900"
    >
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-2xl font-semibold text-sm pointer-events-none ${toast.ok ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.ok ? '✓' : '✗'} {toast.msg}
        </div>
      )}

      {/* Header + Tabs */}
      <div className="px-5 pt-4 pb-0 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold">Items</h1>
            <p className="text-xs text-gray-500 mt-0.5">{items.length} menu items</p>
          </div>
          {tab === 'items' && (
            <button
              onClick={startCreate}
              className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold text-sm px-4 py-2 rounded-xl transition flex items-center gap-1.5"
            >
              + New Item
            </button>
          )}
        </div>
        {/* Tabs */}
        <div className="flex gap-1">
          {(['items', 'coupons'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 transition ${
                tab === t
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'items' ? 'Menu Items' : 'Coupons'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'coupons' ? (
        /* ── Coupons placeholder ── */
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <p className="text-5xl mb-4">🎟️</p>
            <h2 className="text-xl font-bold mb-2">Coupons & Discounts</h2>
            <p className="text-gray-500 text-sm mb-4">Create discount codes, happy hour rules, and promotional offers.</p>
            <div className="text-left bg-white border border-gray-200 rounded-2xl p-4 text-sm text-gray-500 flex flex-col gap-1.5">
              {['% or fixed ฿ discount codes', 'Happy hour time-based pricing', 'Buy X get Y free', 'Member-only discounts', 'Single-use or multi-use'].map(f => (
                <div key={f} className="flex gap-2"><span className="text-amber-500/50">◦</span>{f}</div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── Items split panel ── */
        <div className="flex flex-1 overflow-hidden">

          {/* ── Left: Item List ── */}
          <div className="flex flex-col w-72 shrink-0 border-r border-gray-200 bg-gray-50 overflow-hidden">

            {/* Search */}
            <div className="p-3 border-b border-gray-200">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, SKU..."
                className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-white/25 outline-none focus:border-amber-500/50 transition"
              />
            </div>

            {/* Category filter */}
            <div className="flex gap-1 p-2 border-b border-gray-200 overflow-x-auto shrink-0">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setFilterCat(c.value as MenuCategory | 'all')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition shrink-0 ${
                    filterCat === c.value ? c.color : 'bg-gray-100 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Item list */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="text-center text-gray-300 text-sm py-10">No items found</div>
              ) : (
                filtered.map((item) => {
                  const isSelected = selectedId === item.id
                  return (
                    <div
                      key={item.id}
                      onClick={() => selectItem(item)}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-100 transition ${
                        isSelected ? 'bg-amber-500/10 border-l-2 border-l-amber-500' : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* Image or emoji fallback */}
                      <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center text-xl">
                        {item.image
                          ? <img src={item.image} alt="" className="w-full h-full object-cover" />
                          : <span>{item.category === 'food' ? '🍽️' : item.category === 'beer' ? '🍺' : item.category === 'shot' ? '🥃' : item.category === 'drink' ? '🥤' : item.category === 'snack' ? '🍿' : '🍹'}</span>
                        }
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{item.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${CAT_BADGE[item.category]}`}>
                            {item.category.toUpperCase()}
                          </span>
                          {item.sku && <span className="text-[9px] text-gray-400 font-mono">{item.sku}</span>}
                        </div>
                      </div>

                      {/* Price + toggle */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-sm font-bold text-amber-300">฿{item.price}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleAvailable(item) }}
                          className={`w-9 h-5 rounded-full transition relative ${item.available ? 'bg-emerald-500' : 'bg-gray-300'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${item.available ? 'left-4' : 'left-0.5'}`} />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* List footer */}
            <div className="px-3 py-2 border-t border-gray-200 text-xs text-gray-400">
              {filtered.length} of {items.length} items · {items.filter(i => i.available).length} active
            </div>
          </div>

          {/* ── Right: Editor ── */}
          {!showEditor ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-300">
              <p className="text-5xl">🍹</p>
              <p className="text-sm">Select an item to edit, or create a new one</p>
              <button
                onClick={startCreate}
                className="text-sm text-amber-500/60 hover:text-amber-400 border border-amber-500/20 hover:border-amber-500/40 rounded-xl px-4 py-2 transition"
              >
                + New Item
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Hidden file input */}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

              <div className="max-w-2xl mx-auto px-6 py-5 flex flex-col gap-6">

                {/* Editor header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-gray-700">
                    {isCreating ? 'New Item' : `Edit — ${selectedItem?.name ?? ''}`}
                  </h2>
                  <div className="flex items-center gap-2">
                    {!isCreating && (
                      <button
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-900/30 border border-red-900/40 transition disabled:opacity-40"
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </button>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="px-4 py-1.5 rounded-lg text-sm font-bold bg-amber-500 hover:bg-amber-400 text-black transition active:scale-95 disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : isCreating ? 'Create Item' : 'Save Changes'}
                    </button>
                  </div>
                </div>

                {/* ── Section: Image + Basic Info ── */}
                <section className="flex flex-col gap-4">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Basic Information</h3>

                  <div className="flex gap-4">
                    {/* Image upload */}
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="w-24 h-24 shrink-0 rounded-2xl bg-gray-100 border-2 border-dashed border-gray-200 hover:border-amber-500/40 overflow-hidden flex flex-col items-center justify-center gap-1 transition group"
                    >
                      {form.image ? (
                        <img src={form.image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <>
                          <span className="text-2xl group-hover:scale-110 transition">📷</span>
                          <span className="text-[9px] text-gray-400">Upload photo</span>
                        </>
                      )}
                    </button>

                    {/* Name fields */}
                    <div className="flex-1 flex flex-col gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Name (English) *</label>
                        <input
                          value={form.name}
                          onChange={(e) => setField('name', e.target.value)}
                          placeholder="e.g. Gin Soda"
                          className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 font-semibold outline-none focus:border-amber-500/60 transition"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Name (Thai)</label>
                        <input
                          value={form.nameTh}
                          onChange={(e) => setField('nameTh', e.target.value)}
                          placeholder="e.g. จินโซดา"
                          className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-500/60 transition"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Description</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setField('description', e.target.value)}
                      placeholder="Short description for staff reference or menu display..."
                      rows={2}
                      className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-500/60 transition resize-none"
                    />
                  </div>

                  {/* SKU */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">SKU / Barcode</label>
                    <input
                      value={form.sku}
                      onChange={(e) => setField('sku', e.target.value)}
                      placeholder="e.g. BAR-001"
                      className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 font-mono outline-none focus:border-amber-500/60 transition"
                    />
                  </div>
                </section>

                {/* ── Section: Category & Status ── */}
                <section className="flex flex-col gap-4">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Category & Status</h3>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Category */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Category *</label>
                      <select
                        value={form.category}
                        onChange={(e) => setField('category', e.target.value as MenuCategory)}
                        className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-500/60 transition cursor-pointer"
                      >
                        {CATEGORIES.filter(c => c.value !== 'all').map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Unit */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Unit</label>
                      <select
                        value={form.unit}
                        onChange={(e) => setField('unit', e.target.value)}
                        className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-500/60 transition cursor-pointer"
                      >
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Available toggle */}
                  <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">Available on POS</p>
                      <p className="text-xs text-gray-500">Unavailable items are hidden from the order screen</p>
                    </div>
                    <button
                      onClick={() => setField('available', !form.available)}
                      className={`w-12 h-6 rounded-full transition relative shrink-0 ${form.available ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${form.available ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                </section>

                {/* ── Section: Pricing ── */}
                <section className="flex flex-col gap-4">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pricing</h3>

                  <div className="grid grid-cols-3 gap-3">
                    {/* Selling price */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Selling Price (฿) *</label>
                      <button
                        onClick={() => setNumPadTarget('price')}
                        className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-left font-bold transition hover:border-amber-500/40 active:bg-gray-100"
                      >
                        <span className={form.price ? 'text-gray-900' : 'text-gray-300'}>
                          {form.price || '0'}
                        </span>
                      </button>
                    </div>

                    {/* Cost */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Cost / COGS (฿)</label>
                      <button
                        onClick={() => setNumPadTarget('cost')}
                        className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-left transition hover:border-amber-500/40 active:bg-gray-100"
                      >
                        <span className={form.cost ? 'text-gray-900' : 'text-gray-300'}>
                          {form.cost || '0'}
                        </span>
                      </button>
                    </div>

                    {/* Tax */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">VAT (%)</label>
                      <select
                        value={form.taxRate}
                        onChange={(e) => setField('taxRate', e.target.value)}
                        className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-500/60 transition cursor-pointer"
                      >
                        <option value="0">0% (exempt)</option>
                        <option value="7">7% (standard)</option>
                      </select>
                    </div>
                  </div>

                  {/* Margin display */}
                  {m !== null && (
                    <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
                      m >= 65 ? 'bg-emerald-900/20 border-emerald-800/40' :
                      m >= 40 ? 'bg-amber-900/20 border-amber-800/40' :
                                'bg-red-900/20 border-red-800/40'
                    }`}>
                      <span className="text-xl">{m >= 65 ? '✅' : m >= 40 ? '⚠️' : '🔴'}</span>
                      <div>
                        <p className={`text-sm font-bold ${m >= 65 ? 'text-emerald-400' : m >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                          {m}% gross margin
                        </p>
                        <p className="text-xs text-gray-500">
                          Profit per unit: ฿{(parseFloat(form.price) - parseFloat(form.cost)).toFixed(0)}
                          {m < 40 && '  · Consider raising price or reducing cost'}
                        </p>
                      </div>
                    </div>
                  )}
                </section>

                {/* ── Section: Variants / Selections ── */}
                <section className="flex flex-col gap-4">
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Selections / Variants</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Add modifier groups — e.g. Size (S/M/L), Ice level, Spirit choice
                    </p>
                  </div>
                  <VariantEditor
                    variants={form.variants}
                    onChange={(v) => setField('variants', v)}
                  />
                </section>

                {/* Bottom save button (convenience) */}
                <div className="flex items-center justify-between pt-2 pb-6 border-t border-gray-200">
                  {!isCreating && (
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="text-sm text-red-400 hover:text-red-300 transition disabled:opacity-40"
                    >
                      {isDeleting ? 'Deleting...' : '🗑 Delete item'}
                    </button>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="ml-auto px-6 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-black transition active:scale-95 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : isCreating ? 'Create Item' : 'Save Changes'}
                  </button>
                </div>

              </div>
            </div>
          )}
        </div>
      )}

      {/* Price / Cost NumPad overlay */}
      {numPadTarget && (
        <NumPad
          label={numPadTarget === 'price' ? 'Selling Price (฿)' : 'Cost / COGS (฿)'}
          value={numPadTarget === 'price' ? form.price : form.cost}
          onChange={(v) => setField(numPadTarget, v)}
          onClose={() => setNumPadTarget(null)}
          allowDecimal={false}
          suffix="฿"
        />
      )}
    </div>
  )
}
