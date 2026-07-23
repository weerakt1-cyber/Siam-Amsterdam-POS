'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Member, Order } from '@/lib/types'
import NumPad from '@/components/pos/NumPad'
import { getTier, getPointsToNextTier, TIERS } from '@/lib/loyalty'
import { usePosLang } from '@/lib/pos-i18n'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baht(n: number) {
  return '฿' + new Intl.NumberFormat('en').format(Math.round(n))
}

function daysToBirthday(birthday?: string): number | null {
  if (!birthday) return null
  const today = new Date()
  const [, mm, dd] = birthday.split('-').map(Number)
  const next = new Date(today.getFullYear(), mm - 1, dd)
  if (next < today) next.setFullYear(today.getFullYear() + 1)
  return Math.ceil((next.getTime() - today.getTime()) / 86400000)
}

function formatBirthday(birthday?: string): string {
  if (!birthday) return ''
  const [, mm, dd] = birthday.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${dd} ${months[mm - 1]}`
}

function memberAge(birthday?: string): number | null {
  if (!birthday) return null
  const [yyyy] = birthday.split('-').map(Number)
  return new Date().getFullYear() - yyyy
}

// คำนวณสถิติ member จากออเดอร์
function memberStats(member: Member, orders: Order[]) {
  const matched = orders.filter(
    (o) => o.memberName && o.memberName.trim().toLowerCase() === member.name.trim().toLowerCase()
  )
  const spend = matched.reduce((s, o) => s + o.total, 0)
  return {
    visits: matched.length,
    lifetimeSpend: spend,
    avgOrder: matched.length > 0 ? Math.round(spend / matched.length) : 0,
    recentOrders: matched.slice(0, 10),
  }
}

function emptyForm(): Partial<Member> & { name: string } {
  return { name: '', phone: '', contact: '', birthday: '', notes: '', points: 0, lifetimePoints: 0, tier: 'bronze', stamps: 0, stampsEarned: 0 }
}

function TierPill({ tier, size = 'sm' }: { tier: string; size?: 'xs' | 'sm' }) {
  const found = TIERS.find(x => x.name === tier) ?? TIERS[0]
  const cls = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
  return (
    <span className={`inline-flex items-center gap-0.5 font-bold rounded-full ${cls} ${found.pillClass}`}>
      {found.badge} {found.label}
    </span>
  )
}

// ─── Stamp Card ───────────────────────────────────────────────────────────────

function StampCard({ stamps }: { stamps: number }) {
  const TOTAL = 10
  const filled = Math.min(stamps, TOTAL)
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Stamp Card</span>
        <span className="text-xs text-gray-500">{filled}/{TOTAL} — {TOTAL - filled} to reward</span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: TOTAL }, (_, i) => (
          <div
            key={i}
            className={`h-10 rounded-xl flex items-center justify-center text-lg transition-all ${
              i < filled
                ? 'bg-amber-500 shadow-md shadow-amber-500/30'
                : 'bg-gray-100 border border-dashed border-gray-200'
            }`}
          >
            {i < filled ? '⭐' : ''}
          </div>
        ))}
      </div>
      {filled >= TOTAL && (
        <p className="mt-3 text-center text-emerald-400 font-bold text-sm animate-pulse">
          🎉 REWARD EARNED! Press &#34;Redeem&#34; to use it.
        </p>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const { t: tr } = usePosLang()
  const [members, setMembers] = useState<Member[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [numPadTarget, setNumPadTarget] = useState<'points' | 'addPoints' | null>(null)
  const [addPointsVal, setAddPointsVal] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'visits' | 'spend' | 'tier'>('name')

  const fetchAll = useCallback(async () => {
    const [mr, or] = await Promise.all([
      fetch('/api/members').then((r) => r.json()),
      fetch('/api/orders').then((r) => r.json()),
    ])
    setMembers(mr.members ?? [])
    setOrders(or.orders ?? [])
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  function selectMember(m: Member) {
    setSelectedId(m.id)
    setIsCreating(false)
    setForm({ ...m })
    setAddPointsVal('')
  }

  function startCreate() {
    setSelectedId(null)
    setIsCreating(true)
    setForm(emptyForm())
  }

  async function handleSave() {
    if (!form.name?.trim()) return showToast('Name is required', false)
    setIsSaving(true)
    try {
      if (isCreating) {
        const r = await fetch('/api/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!r.ok) throw new Error((await r.json()).error)
        showToast(`${form.name} added`)
      } else {
        const r = await fetch(`/api/members/${selectedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!r.ok) throw new Error((await r.json()).error)
        showToast('Saved')
      }
      await fetchAll()
      setIsCreating(false)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', false)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedId) return
    const m = members.find((x) => x.id === selectedId)
    if (!confirm(`Delete member "${m?.name}"?`)) return
    setIsDeleting(true)
    try {
      await fetch(`/api/members/${selectedId}`, { method: 'DELETE' })
      showToast('Member deleted')
      setSelectedId(null)
      await fetchAll()
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleAddPoints() {
    if (!selectedId) return
    const delta = parseInt(addPointsVal) || 0
    if (delta === 0) return
    const r = await fetch(`/api/members/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pointsDelta: delta }),
    })
    const json = await r.json()
    if (json.tierChanged) showToast(`${delta > 0 ? '+' : ''}${delta} pts — ${json.newTier.charAt(0).toUpperCase() + json.newTier.slice(1)} tier! 🎉`)
    else showToast(`${delta > 0 ? '+' : ''}${delta} points`)
    setAddPointsVal('')
    await fetchAll()
  }

  async function handleAddStamp() {
    if (!selectedId) return
    const m = members.find((x) => x.id === selectedId)
    if (!m) return
    const newStamps = (m.stamps + 1) % 10
    const newEarned = m.stampsEarned + 1
    await fetch(`/api/members/${selectedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stamps: newStamps, stampsEarned: newEarned }),
    })
    showToast(newStamps === 0 ? '🎉 Stamp card complete! Reward earned.' : `Stamp added (${newStamps}/10)`)
    await fetchAll()
  }

  async function handleRedeemStamps() {
    if (!selectedId) return
    const m = members.find((x) => x.id === selectedId)
    if (!m || m.stamps < 10) return
    await fetch(`/api/members/${selectedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stamps: 0 }),
    })
    showToast('Reward redeemed! Stamp card reset.')
    await fetchAll()
  }

  // Enrich members with stats for sorting/display
  const enriched = members.map((m) => ({ m, stats: memberStats(m, orders) }))

  const filtered = enriched.filter(({ m }) =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.phone?.includes(search) ||
    m.contact?.toLowerCase().includes(search.toLowerCase())
  )

  const TIER_ORDER: Record<string, number> = { gold: 3, silver: 2, bronze: 1 }

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'visits') return b.stats.visits - a.stats.visits
    if (sortBy === 'spend') return b.stats.lifetimeSpend - a.stats.lifetimeSpend
    if (sortBy === 'tier') {
      const diff = (TIER_ORDER[b.m.tier] ?? 1) - (TIER_ORDER[a.m.tier] ?? 1)
      return diff !== 0 ? diff : a.m.name.localeCompare(b.m.name)
    }
    return a.m.name.localeCompare(b.m.name)
  })

  const selected = members.find((m) => m.id === selectedId)
  const selStats = selected ? memberStats(selected, orders) : null
  const showPanel = isCreating || !!selectedId

  // Upcoming birthdays (within 30 days)
  const upcoming = enriched
    .map(({ m }) => ({ m, days: daysToBirthday(m.birthday) }))
    .filter(({ days }) => days !== null && days <= 30)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999))

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

      {/* Header */}
      <div className="px-5 pt-4 pb-3 bg-white border-b border-gray-200 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{tr('navMembers')}</h1>
          <p className="text-xs text-gray-400 mt-0.5">{members.length} {tr('registeredMembers')}</p>
        </div>
        <button
          onClick={startCreate}
          className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold text-sm px-4 py-2 rounded-xl transition flex items-center gap-1.5"
        >
          + {tr('newMember')}
        </button>
      </div>

      {/* Upcoming birthdays banner */}
      {upcoming.length > 0 && (
        <div className="px-5 py-2.5 bg-pink-900/30 border-b border-pink-500/20 flex items-center gap-3 overflow-x-auto shrink-0">
          <span className="text-pink-300 text-sm shrink-0">🎂 Upcoming:</span>
          {upcoming.map(({ m, days }) => (
            <span key={m.id} className="text-xs bg-pink-900/50 text-pink-200 rounded-full px-3 py-1 whitespace-nowrap shrink-0">
              {m.name} — {days === 0 ? 'TODAY! 🎉' : `${days}d`}
            </span>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Member List ── */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-gray-200 bg-gray-50 overflow-hidden">

          {/* Search + Sort */}
          <div className="p-3 border-b border-gray-200 flex flex-col gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Search name, phone, or contact..."
              className="w-full bg-white rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:ring-1 focus:ring-amber-500 transition"
            />
            <div className="flex gap-1">
              {(['name', 'visits', 'spend', 'tier'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`flex-1 text-xs py-1 rounded-lg font-semibold transition ${
                    sortBy === s ? 'bg-amber-500/20 text-amber-400' : 'text-gray-400 hover:text-gray-700'
                  }`}
                >
                  {s === 'name' ? 'A–Z' : s === 'visits' ? 'Visits' : s === 'spend' ? 'Spend' : 'Tier'}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-300 text-sm">
                <p className="text-3xl mb-2">👤</p>
                <p>{search ? 'No results' : 'No members yet'}</p>
              </div>
            ) : (
              sorted.map(({ m, stats }) => {
                const days = daysToBirthday(m.birthday)
                const birthdaySoon = days !== null && days <= 7
                return (
                  <button
                    key={m.id}
                    onClick={() => selectMember(m)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 transition hover:bg-gray-50 ${
                      selectedId === m.id ? 'bg-amber-500/10 border-l-2 border-l-amber-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{m.name}</span>
                      {birthdaySoon && <span className="text-pink-400 text-xs">🎂{days === 0 ? '!' : ` ${days}d`}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <TierPill tier={m.tier} size="xs" />
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-amber-400/70">{m.points}pts</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-gray-400">{stats.visits} visits</span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* ── Right: Detail / Form ── */}
        {!showPanel ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
            <p className="text-6xl mb-4">👥</p>
            <p className="text-base font-semibold">Select a member</p>
            <p className="text-sm mt-1">or create a new one</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

            {/* ── Profile section ── */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-xl font-bold">
                  {isCreating ? tr('newMember') : selected?.name}
                </h2>
                {!isCreating && selected?.birthday && (
                  <p className="text-sm text-gray-400 mt-0.5">
                    {formatBirthday(selected.birthday)}
                    {memberAge(selected.birthday) !== null && ` · ${memberAge(selected.birthday)} years`}
                    {(() => {
                      const d = daysToBirthday(selected.birthday)
                      if (d === 0) return ' 🎂 Birthday today!'
                      if (d !== null && d <= 7) return ` 🎂 in ${d} days`
                      return ''
                    })()}
                  </p>
                )}
              </div>
              {!isCreating && (
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-xs text-gray-400 hover:text-red-500 transition px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-400/30"
                >
                  {isDeleting ? '...' : 'Delete'}
                </button>
              )}
            </div>

            {/* ── Loyalty Tier ── */}
            {!isCreating && selected && (() => {
              const tier       = getTier(selected.lifetimePoints)
              const toNext     = getPointsToNextTier(selected.lifetimePoints)
              const nextTier   = TIERS.find(t => t.name !== tier.name && (TIERS.indexOf(t) > TIERS.indexOf(tier)))
              const progressPct = toNext == null ? 100
                : nextTier
                  ? Math.round(((selected.lifetimePoints - tier.minPoints) / (nextTier.minPoints - tier.minPoints)) * 100)
                  : 100
              return (
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Loyalty Tier</span>
                    <TierPill tier={tier.name} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                    <span>{selected.lifetimePoints.toLocaleString()} lifetime pts</span>
                    {toNext != null ? (
                      <span>{toNext.toLocaleString()} pts to {nextTier?.label}</span>
                    ) : (
                      <span className="text-amber-400 font-semibold">Max tier 🥇</span>
                    )}
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${tier.pillClass.split(' ')[0]}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )
            })()}

            {/* ── Stats row (view only) ── */}
            {!isCreating && selStats && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total Visits', value: selStats.visits, icon: '🗓️' },
                  { label: 'Lifetime Spend', value: baht(selStats.lifetimeSpend), icon: '💰' },
                  { label: 'Avg Order', value: baht(selStats.avgOrder), icon: '📊' },
                ].map(({ label, value, icon }) => (
                  <div key={label} className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
                    <p className="text-xl mb-1">{icon}</p>
                    <p className="text-lg font-black text-amber-400">{value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── Points wallet ── */}
            {!isCreating && selected && (
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Points Wallet</span>
                  <span className="text-2xl font-black text-amber-400">{selected.points} pts</span>
                </div>
                <p className="text-xs text-gray-400 mb-3">1 point per ฿10 spent · 100 pts = ฿50 discount</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setAddPointsVal(''); setNumPadTarget('addPoints') }}
                    className="flex-1 py-2 rounded-xl bg-amber-500/20 text-amber-400 font-bold text-sm hover:bg-amber-500/30 transition active:scale-95"
                  >
                    + Add Points
                  </button>
                  <button
                    onClick={() => {
                      if (selected.points < 100) return showToast('Need 100 points to redeem', false)
                      fetch(`/api/members/${selectedId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ points: selected.points - 100 }),
                      }).then(() => { showToast('100pts redeemed for ฿50 discount'); fetchAll() })
                    }}
                    disabled={selected.points < 100}
                    className="flex-1 py-2 rounded-xl bg-emerald-900/40 text-emerald-400 font-bold text-sm hover:bg-emerald-900/60 transition active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Redeem 100pts
                  </button>
                </div>
              </div>
            )}

            {/* ── Stamp card ── */}
            {!isCreating && selected && (
              <div>
                <StampCard stamps={selected.stamps} />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleAddStamp}
                    className="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-sm transition active:scale-95"
                  >
                    + Stamp (visit)
                  </button>
                  {selected.stamps >= 10 && (
                    <button
                      onClick={handleRedeemStamps}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition active:scale-95"
                    >
                      🎁 Redeem Reward
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Edit / Create form ── */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex flex-col gap-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {isCreating ? 'Member Info' : 'Edit Profile'}
              </h3>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Full Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Name..."
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-400 transition"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Phone</label>
                <input
                  value={form.phone ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="08x-xxx-xxxx"
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-400 transition"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Contact (optional)</label>
                <input
                  value={form.contact ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                  placeholder="Email, LINE ID, Facebook..."
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-400 transition"
                />
                <p className="text-[10px] text-gray-400 mt-1">For sending promotions or birthday greetings</p>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Birthday</label>
                <input
                  type="date"
                  value={form.birthday ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-400 transition"
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Notes</label>
                <textarea
                  value={form.notes ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Preferences, allergies, VIP notes..."
                  rows={2}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-400 transition resize-none"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : isCreating ? 'Create Member' : 'Save Changes'}
                </button>
                {isCreating && (
                  <button
                    onClick={() => { setIsCreating(false); setSelectedId(null) }}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-400 font-semibold text-sm transition"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* ── Visit history ── */}
            {!isCreating && selStats && selStats.recentOrders.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                  Recent Visits ({selStats.visits} total)
                </h3>
                <div className="flex flex-col gap-2">
                  {selStats.recentOrders.map((o) => (
                    <div key={o.id} className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-amber-400">Table {o.tableNo}</span>
                          <span className="text-xs text-gray-400 font-mono">#{o.id.slice(-6)}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {o.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-sm text-amber-300">{baht(o.total)}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* NumPad for points */}
      {numPadTarget === 'addPoints' && (
        <NumPad
          label="Add Points"
          value={addPointsVal}
          onChange={setAddPointsVal}
          onClose={() => { setNumPadTarget(null); handleAddPoints() }}
          allowDecimal={false}
          suffix="pts"
        />
      )}
    </div>
  )
}
