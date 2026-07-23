'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePosLang } from '@/lib/pos-i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = '7d' | '30d' | 'all' | 'mom'

type Comparison = {
  prevRevenue:    number
  prevOrders:     number
  prevAvgOrder:   number
  revenueChange:  number
  ordersChange:   number
  avgOrderChange: number
  prevTopItems:   { menuId: string; name: string; revenue: number; qty: number; rank: number }[]
  weeklyTrend:    { label: string; curr: number; prev: number; currOrders: number; prevOrders: number }[]
  currMonthLabel: string
  prevMonthLabel: string
}

type AnalyticsData = {
  period:        Period
  stats:         { revenue: number; orders: number; avgOrder: number; today: { revenue: number; orders: number } }
  dailyTrend:    { date: string; label: string; revenue: number; orders: number }[]
  topItems:      { name: string; nameTh: string; menuId: string; qty: number; revenue: number }[]
  byPayment:     { method: string; count: number; revenue: number }[]
  bySource:      { source: string; count: number; revenue: number }[]
  byChannel?:    { channel: string; count: number; gross: number; commission: number; net: number }[]
  deliveryStats?: { orders: number; gross: number; commission: number; net: number; inStoreRevenue: number }
  byHour:        number[]
  byCategory:    { category: string; revenue: number; qty: number }[]
  memberStats:   { withMember: number; withoutMember: number; memberRevenue: number; nonMemberRevenue: number }
  discountStats: { totalDiscount: number; ordersWithDiscount: number; totalOrders: number }
  comparison?:   Comparison
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const baht = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

const pct = (n: number, total: number) =>
  total > 0 ? Math.round((n / total) * 100) : 0

const PAY_COLORS: Record<string, string> = {
  cash:         'bg-amber-500',
  card:         'bg-emerald-500',
  promptpay:    'bg-purple-500',
  credit_card:  'bg-blue-500',
  promptpay_qr: 'bg-violet-500',
  wechat_pay:   'bg-green-500',
  unknown:      'bg-slate-500',
}
const PAY_LABELS: Record<string, string> = {
  cash:         'Cash',
  card:         'EDC Card',
  promptpay:    'PromptPay',
  credit_card:  'Credit Card',
  promptpay_qr: 'PromptPay QR',
  wechat_pay:   'WeChat/Alipay',
  unknown:      'Unknown',
}
const SRC_COLORS: Record<string, string> = {
  pos:    'bg-amber-500',
  qr:     'bg-teal-500',
  manual: 'bg-slate-500',
}
const SRC_LABELS: Record<string, string> = {
  pos:    'POS (Staff)',
  qr:     'QR Self-Order',
  manual: 'Manual',
}
const CH_COLORS: Record<string, string> = {
  grab:       'bg-green-500',
  lineman:    'bg-emerald-500',
  shopeefood: 'bg-orange-500',
}
const CH_LABELS: Record<string, string> = {
  grab:       'GrabFood',
  lineman:    'LINE MAN',
  shopeefood: 'Shopee Food',
}
const CAT_COLORS: Record<string, string> = {
  Cocktail: 'bg-amber-500',
  Beer:     'bg-yellow-500',
  Drink:    'bg-sky-500',
  Snack:    'bg-emerald-500',
  Food:     'bg-rose-500',
  Shot:     'bg-violet-500',
  Other:    'bg-slate-500',
}

// ─── Base UI components ───────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-stone-100 rounded-xl p-4 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">{children}</h3>
}

// ─── Chart components ─────────────────────────────────────────────────────────

// Single-color vertical bar (7d / 30d / all)
function VertBar({ data, height = 140 }: {
  data: { label: string; value: number; sub?: string }[]
  height?: number
}) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
          <div
            className={`w-full rounded-t-sm transition-all ${d.value > 0 ? 'bg-amber-500' : 'bg-stone-100'}`}
            style={{ height: `${Math.max(d.value > 0 ? 4 : 2, (d.value / max) * (height - 22))}px` }}
            title={`${d.label}: ${baht(d.value)} (${d.sub ?? ''} orders)`}
          />
          <span className="text-[8px] text-stone-400 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// Grouped bar chart for MoM — amber = current month, gray = previous month
function GroupedBar({ data, height = 140, currLabel, prevLabel }: {
  data: { label: string; curr: number; prev: number; currOrders: number; prevOrders: number }[]
  height?: number
  currLabel?: string
  prevLabel?: string
}) {
  const max  = Math.max(...data.flatMap(d => [d.curr, d.prev]), 1)
  const barH = height - 30
  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-[10px] text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm bg-amber-500 inline-block" />
          {currLabel ?? 'This month'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm bg-stone-300 inline-block" />
          {prevLabel ?? 'Last month'}
        </span>
      </div>
      <div className="flex items-end gap-1" style={{ height: barH }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center min-w-0">
            <div className="w-full flex items-end gap-px" style={{ height: barH - 16 }}>
              <div
                className="flex-1 rounded-t bg-amber-500 transition-all"
                style={{ height: `${Math.max(d.curr > 0 ? 3 : 1, (d.curr / max) * (barH - 16))}px` }}
                title={`${d.label} (${currLabel ?? 'curr'}): ${baht(d.curr)} · ${d.currOrders} orders`}
              />
              <div
                className="flex-1 rounded-t bg-stone-300 transition-all"
                style={{ height: `${Math.max(d.prev > 0 ? 3 : 1, (d.prev / max) * (barH - 16))}px` }}
                title={`${d.label} (${prevLabel ?? 'prev'}): ${baht(d.prev)} · ${d.prevOrders} orders`}
              />
            </div>
            <span className="text-[8px] text-stone-400 text-center mt-1 w-full truncate">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Horizontal bar
function HBar({ label, value, maxValue, color = 'bg-amber-500', sub }: {
  label: string; value: number; maxValue: number; color?: string; sub?: string
}) {
  const w = maxValue > 0 ? Math.max(pct(value, maxValue), 1) : 0
  return (
    <div className="group">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm text-stone-800 truncate max-w-[55%]">{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold text-stone-900">{baht(value)}</span>
          {sub && <span className="text-xs text-stone-400">{sub}</span>}
        </div>
      </div>
      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${w}%` }} />
      </div>
    </div>
  )
}

// Peak-hours heatmap
function HeatHour({ data }: { data: number[] }) {
  const max = Math.max(...data, 1)
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 3 }}>
        {data.map((v, h) => (
          <div
            key={h}
            className="rounded flex flex-col items-center justify-end gap-0.5"
            style={{ height: 48 }}
            title={`${String(h).padStart(2, '0')}:00 — ${v} orders`}
          >
            <div
              className="w-full rounded-sm transition-all"
              style={{
                height: `${Math.max(v > 0 ? 4 : 2, (v / max) * 36)}px`,
                background: v > 0
                  ? `rgba(245,158,11,${Math.max(0.2, v / max)})`
                  : 'rgba(0,0,0,0.05)',
              }}
            />
            <span className="text-[7px] text-stone-300 leading-none">{h % 3 === 0 ? h : ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── MoM-specific components ──────────────────────────────────────────────────

// Small delta arrow badge used on KPI cards
function DeltaBadge({ change }: { change: number }) {
  if (change === 0) return <span className="text-[9px] text-stone-400">— flat</span>
  const up = change > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? '↑' : '↓'} {up ? '+' : ''}{change.toFixed(1)}% vs last mo
    </span>
  )
}

// Headline callout: "Revenue ↑ ฿8,200 (+18%) · Orders ↑ 12 (+8%)"
function MomCallout({ stats, comparison }: { stats: AnalyticsData['stats']; comparison: Comparison }) {
  const revDiff = stats.revenue - comparison.prevRevenue
  const ordDiff = stats.orders  - comparison.prevOrders
  const revUp   = revDiff >= 0
  const ordUp   = ordDiff >= 0
  return (
    <div className={`rounded-xl px-4 py-3 border ${revUp ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="text-xs font-bold text-stone-700">
          {comparison.currMonthLabel}
          <span className="font-normal text-stone-400 mx-1.5">vs</span>
          {comparison.prevMonthLabel}
        </span>
        <span className={`text-xs font-semibold ${revUp ? 'text-emerald-700' : 'text-red-600'}`}>
          Revenue {revUp ? '↑' : '↓'} {baht(Math.abs(revDiff))}
          <span className="font-normal opacity-75 ml-1">({revUp ? '+' : ''}{comparison.revenueChange.toFixed(1)}%)</span>
        </span>
        <span className={`text-xs font-semibold ${ordUp ? 'text-emerald-700' : 'text-red-600'}`}>
          Orders {ordUp ? '↑' : '↓'} {Math.abs(ordDiff)}
          <span className="font-normal opacity-75 ml-1">({ordUp ? '+' : ''}{comparison.ordersChange.toFixed(1)}%)</span>
        </span>
        <span className={`text-xs font-semibold ${comparison.avgOrderChange >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
          Avg {comparison.avgOrderChange >= 0 ? '↑' : '↓'} {baht(Math.abs(stats.avgOrder - comparison.prevAvgOrder))}
          <span className="font-normal opacity-75 ml-1">({comparison.avgOrderChange >= 0 ? '+' : ''}{comparison.avgOrderChange.toFixed(1)}%)</span>
        </span>
      </div>
    </div>
  )
}

// Rank-change badge on top items: ↑2 ↓1 NEW
function RankBadge({ menuId, currentRank, prevTopItems }: {
  menuId:       string
  currentRank:  number
  prevTopItems: Comparison['prevTopItems']
}) {
  const prev = prevTopItems.find(i => i.menuId === menuId)
  if (!prev) {
    return (
      <span className="text-[8px] font-bold bg-emerald-100 text-emerald-600 px-1 py-0.5 rounded-full leading-none shrink-0">
        NEW
      </span>
    )
  }
  const delta = prev.rank - currentRank   // positive = moved up in rankings
  if (delta === 0) return null
  return (
    <span className={`text-[8px] font-bold px-1 py-0.5 rounded-full leading-none shrink-0 ${
      delta > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'
    }`}>
      {delta > 0 ? `↑${delta}` : `↓${Math.abs(delta)}`}
    </span>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TierStats = { bronze: number; silver: number; gold: number }

export default function AnalyticsPage() {
  const { t } = usePosLang()
  const [period, setPeriod]           = useState<Period>('7d')
  const [topBy, setTopBy]             = useState<'revenue' | 'qty'>('revenue')
  const [data, setData]               = useState<AnalyticsData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [tierStats, setTierStats]     = useState<TierStats | null>(null)

  useEffect(() => {
    fetch('/api/members')
      .then(r => r.json())
      .then((d: { members?: { tier?: string }[] }) => {
        const members = d.members ?? []
        setTierStats({
          bronze: members.filter(m => m.tier === 'bronze' || !m.tier).length,
          silver: members.filter(m => m.tier === 'silver').length,
          gold:   members.filter(m => m.tier === 'gold').length,
        })
      })
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/analytics?period=${period}`)
      if (r.ok) {
        setData(await r.json())
        setLastUpdated(new Date())
      }
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 60 s
  useEffect(() => {
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  const PERIODS: { key: Period; label: string }[] = [
    { key: '7d',  label: t('an7d') },
    { key: '30d', label: t('an30d') },
    { key: 'mom', label: t('anMoM') },
    { key: 'all', label: t('anAllTime') },
  ]

  const sortedTopItems = data
    ? [...data.topItems].sort((a, b) => topBy === 'revenue' ? b.revenue - a.revenue : b.qty - a.qty)
    : []

  const totalPayRevenue = data?.byPayment.reduce((s, p) => s + p.revenue, 0) ?? 0
  const totalSrcRevenue = data?.bySource.reduce((s, p) => s + p.revenue, 0) ?? 0
  const totalCatRevenue = data?.byCategory.reduce((s, c) => s + c.revenue, 0) ?? 0
  const topItemMax = topBy === 'revenue'
    ? Math.max(...sortedTopItems.map(i => i.revenue), 1)
    : Math.max(...sortedTopItems.map(i => i.qty), 1)

  const isMoM      = period === 'mom'
  const comparison = data?.comparison ?? null

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-stone-50 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 bg-white shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-lg">📊</span>
          <h1 className="text-base font-bold text-stone-900">{t('anTitle')}</h1>
          {lastUpdated && (
            <span className="text-xs text-stone-400">
              {t('anUpdated')} {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-stone-100 rounded-xl p-0.5 gap-0.5">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onPointerDown={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  period === p.key
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onPointerDown={load}
            className="w-8 h-8 rounded-xl bg-stone-100 text-stone-500 hover:bg-gray-200 flex items-center justify-center text-sm transition-all active:scale-95"
            title={t('anRefresh')}
          >
            🔄
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── MoM headline callout ───────────────────────────────────────── */}
        {isMoM && data && comparison && (
          <MomCallout stats={data.stats} comparison={comparison} />
        )}
        {isMoM && loading && !data && (
          <div className="h-10 bg-stone-100 rounded-xl animate-pulse" />
        )}

        {/* ── KPI Summary Cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-3">

          {/* Revenue */}
          <Card className={loading ? 'opacity-50' : ''}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">💰</span>
              <span className="text-xs text-stone-400">{t('anRevenue')}</span>
            </div>
            <div className="text-lg font-bold text-stone-900 leading-tight">{baht(data?.stats.revenue ?? 0)}</div>
            <div className="text-xs text-stone-400 mt-0.5">{data?.stats.orders ?? 0} {t('anOrders')}</div>
            {isMoM && comparison && <div className="mt-1"><DeltaBadge change={comparison.revenueChange} /></div>}
          </Card>

          {/* Avg Order */}
          <Card className={loading ? 'opacity-50' : ''}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🧾</span>
              <span className="text-xs text-stone-400">{t('anAvgOrder')}</span>
            </div>
            <div className="text-lg font-bold text-stone-900 leading-tight">{baht(data?.stats.avgOrder ?? 0)}</div>
            <div className="text-xs text-stone-400 mt-0.5">{t('anPerTxn')}</div>
            {isMoM && comparison && <div className="mt-1"><DeltaBadge change={comparison.avgOrderChange} /></div>}
          </Card>

          {/* Today's Rev / Orders MoM */}
          <Card className={loading ? 'opacity-50' : ''}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">📅</span>
              <span className="text-xs text-stone-400">{isMoM ? t('anOrdersMoM') : t('anTodayRev')}</span>
            </div>
            {isMoM ? (
              <>
                <div className="text-lg font-bold text-stone-900 leading-tight">{data?.stats.orders ?? 0}</div>
                <div className="text-xs text-stone-400 mt-0.5">{t('anThisMonth')}</div>
                {comparison && <div className="mt-1"><DeltaBadge change={comparison.ordersChange} /></div>}
              </>
            ) : (
              <>
                <div className="text-lg font-bold text-stone-900 leading-tight">{baht(data?.stats.today.revenue ?? 0)}</div>
                <div className="text-xs text-stone-400 mt-0.5">{data?.stats.today.orders ?? 0} {t('anOrders')}</div>
              </>
            )}
          </Card>

          {/* Member Orders */}
          <Card className={loading ? 'opacity-50' : ''}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">👥</span>
              <span className="text-xs text-stone-400">{t('anMemberOrders')}</span>
            </div>
            <div className="text-lg font-bold text-stone-900 leading-tight">{data?.memberStats.withMember ?? 0}</div>
            <div className="text-xs text-stone-400 mt-0.5">
              {data ? `${pct(data.memberStats.withMember, data.stats.orders)}% ${t('anOfTotal')}` : '—'}
            </div>
          </Card>

          {/* Total Saved */}
          <Card className={loading ? 'opacity-50' : ''}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🎟️</span>
              <span className="text-xs text-stone-400">{t('anTotalSaved')}</span>
            </div>
            <div className="text-lg font-bold text-stone-900 leading-tight">{baht(data?.discountStats.totalDiscount ?? 0)}</div>
            <div className="text-xs text-stone-400 mt-0.5">{data?.discountStats.ordersWithDiscount ?? 0} {t('anOrders')}</div>
          </Card>
        </div>

        {/* ── Revenue Trend ─────────────────────────────────────────────────── */}
        <Card>
          {isMoM ? (
            <>
              <SectionTitle>
                Weekly Revenue — {comparison?.currMonthLabel ?? 'This Month'} vs {comparison?.prevMonthLabel ?? 'Last Month'}
              </SectionTitle>
              {data && comparison ? (
                <GroupedBar
                  data={comparison.weeklyTrend}
                  height={140}
                  currLabel={comparison.currMonthLabel}
                  prevLabel={comparison.prevMonthLabel}
                />
              ) : (
                <div className="h-36 bg-stone-100 rounded animate-pulse" />
              )}
            </>
          ) : (
            <>
              <SectionTitle>{t('anRevTrend14')}</SectionTitle>
              {data ? (
                <div className="space-y-2">
                  <VertBar
                    data={data.dailyTrend.map(d => ({ label: d.label, value: d.revenue, sub: String(d.orders) }))}
                    height={140}
                  />
                  <div className="flex gap-0.5">
                    {data.dailyTrend.map((d, i) => (
                      <div key={i} className="flex-1 text-center">
                        {d.orders > 0 && <span className="text-[7px] text-stone-400">{d.orders}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-36 bg-stone-100 rounded animate-pulse" />
              )}
            </>
          )}
        </Card>

        {/* ── Top Items + Payment / Source ───────────────────────────────── */}
        <div className="grid grid-cols-5 gap-4">

          {/* Top Items */}
          <Card className="col-span-3">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>{t('anTopItems')}{isMoM ? ` — ${t('anThisMonthSuffix')}` : ''}</SectionTitle>
              <div className="flex bg-stone-100 rounded-lg p-0.5 gap-0.5">
                {(['revenue', 'qty'] as const).map(k => (
                  <button
                    key={k}
                    onPointerDown={() => setTopBy(k)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all ${
                      topBy === k ? 'bg-amber-500 text-black' : 'text-stone-400 hover:text-stone-700'
                    }`}
                  >
                    {k === 'revenue' ? 'By Revenue' : 'By Qty'}
                  </button>
                ))}
              </div>
            </div>
            {data ? (
              <div className="space-y-3">
                {sortedTopItems.slice(0, 8).map((item, i) => (
                  <div key={item.menuId} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-stone-300 w-4 text-right shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm text-stone-800 truncate">{item.name}</span>
                          {isMoM && comparison && topBy === 'revenue' && (
                            <RankBadge
                              menuId={item.menuId}
                              currentRank={i + 1}
                              prevTopItems={comparison.prevTopItems}
                            />
                          )}
                        </div>
                        <div className="flex items-baseline gap-2 shrink-0 ml-2">
                          <span className="text-xs text-stone-400">{item.qty} pcs</span>
                          <span className="text-sm font-semibold text-amber-400">{baht(item.revenue)}</span>
                        </div>
                      </div>
                      <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-500 transition-all"
                          style={{ width: `${pct(topBy === 'revenue' ? item.revenue : item.qty, topItemMax)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {sortedTopItems.length === 0 && (
                  <p className="text-sm text-stone-400 text-center py-4">No orders in this period</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {Array(6).fill(0).map((_, i) => (
                  <div key={i} className="h-8 bg-stone-100 rounded animate-pulse" />
                ))}
              </div>
            )}
          </Card>

          {/* Payment Methods + Sources */}
          <Card className="col-span-2 space-y-5">
            <div>
              <SectionTitle>{t('anPaymentMethods')}</SectionTitle>
              {data ? (
                <div className="space-y-3">
                  {data.byPayment.map(p => (
                    <HBar
                      key={p.method}
                      label={PAY_LABELS[p.method] ?? p.method}
                      value={p.revenue}
                      maxValue={totalPayRevenue}
                      color={PAY_COLORS[p.method] ?? 'bg-slate-500'}
                      sub={`${pct(p.revenue, totalPayRevenue)}% · ${p.count}`}
                    />
                  ))}
                  {data.byPayment.length > 0 && (
                    <div className="flex h-2 rounded-full overflow-hidden gap-px mt-1">
                      {data.byPayment.map(p => (
                        <div
                          key={p.method}
                          className={`h-full transition-all ${PAY_COLORS[p.method] ?? 'bg-slate-500'}`}
                          style={{ width: `${pct(p.revenue, totalPayRevenue)}%` }}
                        />
                      ))}
                    </div>
                  )}
                  {data.byPayment.length === 0 && <p className="text-sm text-stone-400">{t('anNoData')}</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  {Array(3).fill(0).map((_, i) => <div key={i} className="h-6 bg-stone-100 rounded animate-pulse" />)}
                </div>
              )}
            </div>

            <div className="border-t border-stone-200" />

            <div>
              <SectionTitle>{t('anOrderSources')}</SectionTitle>
              {data ? (
                <div className="space-y-3">
                  {data.bySource.map(s => (
                    <HBar
                      key={s.source}
                      label={SRC_LABELS[s.source] ?? s.source}
                      value={s.revenue}
                      maxValue={totalSrcRevenue}
                      color={SRC_COLORS[s.source] ?? 'bg-slate-500'}
                      sub={`${pct(s.revenue, totalSrcRevenue)}% · ${s.count}`}
                    />
                  ))}
                  {data.bySource.length > 0 && (
                    <div className="flex h-2 rounded-full overflow-hidden gap-px mt-1">
                      {data.bySource.map(s => (
                        <div
                          key={s.source}
                          className={`h-full transition-all ${SRC_COLORS[s.source] ?? 'bg-slate-500'}`}
                          style={{ width: `${pct(s.revenue, totalSrcRevenue)}%` }}
                        />
                      ))}
                    </div>
                  )}
                  {data.bySource.length === 0 && <p className="text-sm text-stone-400">{t('anNoData')}</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  {Array(2).fill(0).map((_, i) => <div key={i} className="h-6 bg-stone-100 rounded animate-pulse" />)}
                </div>
              )}
            </div>

            {/* Delivery Channels — gross vs net after platform commission */}
            {data?.byChannel && data.byChannel.length > 0 && data.deliveryStats && (
              <>
                <div className="border-t border-stone-200" />
                <div>
                  <SectionTitle>🛵 Delivery Channels</SectionTitle>
                  <div className="space-y-3">
                    {data.byChannel.map(c => (
                      <HBar
                        key={c.channel}
                        label={CH_LABELS[c.channel] ?? c.channel}
                        value={c.gross}
                        maxValue={data.deliveryStats!.gross}
                        color={CH_COLORS[c.channel] ?? 'bg-slate-500'}
                        sub={`${c.count} orders · net ${baht(c.net)}`}
                      />
                    ))}
                    <div className="flex items-center justify-between text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2 mt-1">
                      <span>
                        Delivery {baht(data.deliveryStats.gross)} gross
                        <span className="text-red-400"> − {baht(data.deliveryStats.commission)} commission</span>
                      </span>
                      <span className="font-bold text-emerald-600">= {baht(data.deliveryStats.net)} net</span>
                    </div>
                    <p className="text-[11px] text-stone-400">
                      Delivery is {pct(data.deliveryStats.gross, data.stats.revenue)}% of revenue · in-store {baht(data.deliveryStats.inStoreRevenue)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* ── Peak Hours Heatmap ─────────────────────────────────────────── */}
        <Card>
          <SectionTitle>{t('anPeakHours')}{isMoM ? ` (${t('anThisMonthSuffix')})` : ''}</SectionTitle>
          {data ? (
            <div className="space-y-2">
              <HeatHour data={data.byHour} />
              <div className="flex justify-between text-[9px] text-stone-400 mt-1 px-0.5">
                <span>Midnight</span>
                <span>6am</span>
                <span>Noon</span>
                <span>6pm</span>
                <span>11pm</span>
              </div>
              {data.byHour.some(h => h > 0) && (() => {
                const peak  = data.byHour.indexOf(Math.max(...data.byHour))
                const total = data.byHour.reduce((s, v) => s + v, 0)
                return (
                  <p className="text-xs text-stone-400 text-center pt-1">
                    Busiest hour: <span className="text-amber-400 font-semibold">{String(peak).padStart(2, '0')}:00</span>
                    {' '}with <span className="text-stone-700">{data.byHour[peak]}</span> orders
                    {' '}({pct(data.byHour[peak], total)}% of total)
                  </p>
                )
              })()}
            </div>
          ) : (
            <div className="h-16 bg-stone-100 rounded animate-pulse" />
          )}
        </Card>

        {/* ── Category + Members + Discounts ────────────────────────────── */}
        <div className="grid grid-cols-5 gap-4 pb-4">

          <Card className="col-span-2">
            <SectionTitle>{t('anRevByCategory')}</SectionTitle>
            {data ? (
              <div className="space-y-3">
                {data.byCategory.map(c => (
                  <HBar
                    key={c.category}
                    label={c.category}
                    value={c.revenue}
                    maxValue={totalCatRevenue}
                    color={CAT_COLORS[c.category] ?? 'bg-slate-500'}
                    sub={`${pct(c.revenue, totalCatRevenue)}%`}
                  />
                ))}
                {data.byCategory.length === 0 && <p className="text-sm text-stone-400">{t('anNoData')}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                {Array(5).fill(0).map((_, i) => <div key={i} className="h-6 bg-stone-100 rounded animate-pulse" />)}
              </div>
            )}
          </Card>

          <Card className="col-span-2">
            <SectionTitle>Member vs Non-member</SectionTitle>
            {data ? (
              <div className="space-y-4">
                <div className="space-y-3">
                  <HBar
                    label="Member Orders"
                    value={data.memberStats.memberRevenue}
                    maxValue={data.stats.revenue}
                    color="bg-amber-500"
                    sub={`${data.memberStats.withMember} orders`}
                  />
                  <HBar
                    label="Non-member"
                    value={data.memberStats.nonMemberRevenue}
                    maxValue={data.stats.revenue}
                    color="bg-slate-500"
                    sub={`${data.memberStats.withoutMember} orders`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-stone-200">
                  <div className="text-center">
                    <div className="text-xl font-bold text-amber-400">
                      {pct(data.memberStats.withMember, data.stats.orders)}%
                    </div>
                    <div className="text-xs text-stone-400">Member rate</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-stone-900">
                      {data.stats.orders > 0 && data.memberStats.withMember > 0
                        ? baht(Math.round(data.memberStats.memberRevenue / data.memberStats.withMember))
                        : '—'}
                    </div>
                    <div className="text-xs text-stone-400">Avg member spend</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {Array(4).fill(0).map((_, i) => <div key={i} className="h-6 bg-stone-100 rounded animate-pulse" />)}
              </div>
            )}
          </Card>

          <Card className="col-span-1">
            <SectionTitle>Discounts</SectionTitle>
            {data ? (
              <div className="space-y-4">
                <div>
                  <div className="text-2xl font-bold text-stone-900 leading-tight">
                    {baht(data.discountStats.totalDiscount)}
                  </div>
                  <div className="text-xs text-stone-400 mt-0.5">total savings given</div>
                </div>
                <div className="space-y-2 border-t border-stone-200 pt-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Orders w/ discount</span>
                    <span className="text-stone-900 font-semibold">{data.discountStats.ordersWithDiscount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Discount rate</span>
                    <span className="text-stone-900 font-semibold">
                      {pct(data.discountStats.ordersWithDiscount, data.discountStats.totalOrders)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Avg per order</span>
                    <span className="text-stone-900 font-semibold">
                      {data.discountStats.ordersWithDiscount > 0
                        ? baht(Math.round(data.discountStats.totalDiscount / data.discountStats.ordersWithDiscount))
                        : '—'}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${pct(data.discountStats.ordersWithDiscount, data.discountStats.totalOrders)}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {Array(4).fill(0).map((_, i) => <div key={i} className="h-5 bg-stone-100 rounded animate-pulse" />)}
              </div>
            )}
          </Card>
        </div>

        {/* ── Loyalty Tier Breakdown ─────────────────────────────────────── */}
        <Card className="pb-4">
          <SectionTitle>Loyalty Tier Breakdown</SectionTitle>
          {tierStats ? (() => {
            const total = tierStats.bronze + tierStats.silver + tierStats.gold
            const tiers = [
              { name: 'Gold',   count: tierStats.gold,   pill: 'bg-amber-400 text-amber-900', bar: 'bg-amber-400', badge: '🥇', mult: '2×' },
              { name: 'Silver', count: tierStats.silver, pill: 'bg-slate-300 text-slate-900', bar: 'bg-slate-400', badge: '🥈', mult: '1.5×' },
              { name: 'Bronze', count: tierStats.bronze, pill: 'bg-amber-800 text-amber-100', bar: 'bg-amber-800', badge: '🥉', mult: '1×' },
            ]
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  {tiers.map(t => (
                    <div key={t.name} className="text-center">
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${t.pill} mb-2`}>
                        {t.badge} {t.name}
                      </div>
                      <div className="text-2xl font-black text-stone-900">{t.count}</div>
                      <div className="text-[10px] text-stone-400">{t.mult} pts · {total > 0 ? pct(t.count, total) : 0}%</div>
                    </div>
                  ))}
                </div>
                <div className="flex h-2 rounded-full overflow-hidden">
                  {total === 0 ? (
                    <div className="flex-1 bg-stone-100 rounded-full" />
                  ) : (
                    tiers.map(t => t.count > 0 ? (
                      <div
                        key={t.name}
                        className={`h-full transition-all ${t.bar}`}
                        style={{ width: `${pct(t.count, total)}%` }}
                      />
                    ) : null)
                  )}
                </div>
                <p className="text-xs text-stone-400 text-center">
                  {total} total members · Bronze 0–4,999 pts · Silver 5,000–19,999 · Gold 20,000+
                </p>
              </div>
            )
          })() : (
            <div className="h-16 bg-stone-100 rounded animate-pulse" />
          )}
        </Card>

      </div>
    </div>
  )
}
