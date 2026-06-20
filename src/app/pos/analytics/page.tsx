'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = '7d' | '30d' | 'all'

type AnalyticsData = {
  period: Period
  stats: { revenue: number; orders: number; avgOrder: number; today: { revenue: number; orders: number } }
  dailyTrend: { date: string; label: string; revenue: number; orders: number }[]
  topItems: { name: string; nameTh: string; menuId: string; qty: number; revenue: number }[]
  byPayment: { method: string; count: number; revenue: number }[]
  bySource: { source: string; count: number; revenue: number }[]
  byHour: number[]
  byCategory: { category: string; revenue: number; qty: number }[]
  memberStats: { withMember: number; withoutMember: number; memberRevenue: number; nonMemberRevenue: number }
  discountStats: { totalDiscount: number; ordersWithDiscount: number; totalOrders: number }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const baht = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

const pct = (n: number, total: number) =>
  total > 0 ? Math.round((n / total) * 100) : 0

const PAY_COLORS: Record<string, string> = {
  cash: 'bg-amber-500',
  card: 'bg-emerald-500',
  promptpay: 'bg-purple-500',
  unknown: 'bg-slate-500',
}
const PAY_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  promptpay: 'PromptPay',
  unknown: 'Unknown',
}
const SRC_COLORS: Record<string, string> = {
  pos: 'bg-amber-500',
  tilda: 'bg-teal-500',
  manual: 'bg-slate-500',
}
const SRC_LABELS: Record<string, string> = {
  pos: 'POS (Staff)',
  tilda: 'Tilda (QR)',
  manual: 'Manual',
}
const CAT_COLORS: Record<string, string> = {
  Cocktails: 'bg-amber-500',
  Beer: 'bg-yellow-500',
  'Draft Beer': 'bg-orange-500',
  Drinks: 'bg-sky-500',
  Food: 'bg-rose-500',
  Snacks: 'bg-emerald-500',
  Other: 'bg-slate-500',
}

// ─── Chart components ─────────────────────────────────────────────────────────

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

// แผนภูมิแท่งแนวตั้ง — สำหรับ Revenue Trend
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

// แผนภูมิแท่งแนวนอน
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

// แผนผัง 24 ชั่วโมง — Peak Hours heatmap
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('7d')
  const [topBy, setTopBy] = useState<'revenue' | 'qty'>('revenue')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

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

  // รีเฟรชทุก 60 วินาที
  useEffect(() => {
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  const PERIODS: { key: Period; label: string }[] = [
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: 'all', label: 'All Time' },
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-stone-50 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 bg-white shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-lg">📊</span>
          <h1 className="text-base font-bold text-stone-900">Analytics</h1>
          {lastUpdated && (
            <span className="text-xs text-stone-400">
              updated {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Period tabs */}
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
            title="Refresh"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── KPI Summary Cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { icon: '💰', label: 'Revenue', value: baht(data?.stats.revenue ?? 0), sub: `${data?.stats.orders ?? 0} orders` },
            { icon: '🧾', label: 'Avg Order', value: baht(data?.stats.avgOrder ?? 0), sub: 'per transaction' },
            { icon: '📅', label: "Today's Rev", value: baht(data?.stats.today.revenue ?? 0), sub: `${data?.stats.today.orders ?? 0} orders` },
            { icon: '👥', label: 'Member Orders', value: `${data?.memberStats.withMember ?? 0}`, sub: data ? `${pct(data.memberStats.withMember, data.stats.orders)}% of total` : '—' },
            { icon: '🎟️', label: 'Total Saved', value: baht(data?.discountStats.totalDiscount ?? 0), sub: `${data?.discountStats.ordersWithDiscount ?? 0} orders` },
          ].map((c, i) => (
            <Card key={i} className={loading ? 'opacity-50' : ''}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{c.icon}</span>
                <span className="text-xs text-stone-400">{c.label}</span>
              </div>
              <div className="text-lg font-bold text-stone-900 leading-tight">{c.value}</div>
              <div className="text-xs text-stone-400 mt-0.5">{c.sub}</div>
            </Card>
          ))}
        </div>

        {/* ── Revenue Trend (14 days) ────────────────────────────────────── */}
        <Card>
          <SectionTitle>Revenue Trend — Last 14 Days</SectionTitle>
          {data ? (
            <div className="space-y-2">
              <VertBar
                data={data.dailyTrend.map(d => ({ label: d.label, value: d.revenue, sub: String(d.orders) }))}
                height={140}
              />
              {/* Revenue + orders annotation row */}
              <div className="flex gap-0.5">
                {data.dailyTrend.map((d, i) => (
                  <div key={i} className="flex-1 text-center">
                    {d.orders > 0 && (
                      <span className="text-[7px] text-stone-400">{d.orders}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-36 bg-stone-100 rounded animate-pulse" />
          )}
        </Card>

        {/* ── Top Items + Payment / Source ───────────────────────────────── */}
        <div className="grid grid-cols-5 gap-4">

          {/* Top Items */}
          <Card className="col-span-3">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>Top Items</SectionTitle>
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
                        <span className="text-sm text-stone-800 truncate">{item.name}</span>
                        <div className="flex items-baseline gap-2 shrink-0">
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
            {/* Payment Methods */}
            <div>
              <SectionTitle>Payment Methods</SectionTitle>
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
                  {/* Stacked bar */}
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
                  {data.byPayment.length === 0 && <p className="text-sm text-stone-400">No data</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  {Array(3).fill(0).map((_, i) => <div key={i} className="h-6 bg-stone-100 rounded animate-pulse" />)}
                </div>
              )}
            </div>

            <div className="border-t border-stone-200" />

            {/* Order Sources */}
            <div>
              <SectionTitle>Order Sources</SectionTitle>
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
                  {data.bySource.length === 0 && <p className="text-sm text-stone-400">No data</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  {Array(2).fill(0).map((_, i) => <div key={i} className="h-6 bg-stone-100 rounded animate-pulse" />)}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── Peak Hours Heatmap ─────────────────────────────────────────── */}
        <Card>
          <SectionTitle>Peak Hours — Orders by Hour</SectionTitle>
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
              {/* Peak hour annotation */}
              {data.byHour.some(h => h > 0) && (() => {
                const peak = data.byHour.indexOf(Math.max(...data.byHour))
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

          {/* Category Revenue */}
          <Card className="col-span-2">
            <SectionTitle>Revenue by Category</SectionTitle>
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
                {data.byCategory.length === 0 && <p className="text-sm text-stone-400">No data</p>}
              </div>
            ) : (
              <div className="space-y-2">
                {Array(5).fill(0).map((_, i) => <div key={i} className="h-6 bg-stone-100 rounded animate-pulse" />)}
              </div>
            )}
          </Card>

          {/* Member Stats */}
          <Card className="col-span-2">
            <SectionTitle>Member vs Non-member</SectionTitle>
            {data ? (
              <div className="space-y-4">
                {/* Bar comparison */}
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
                {/* Stats row */}
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

          {/* Discount Stats */}
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
                {/* Progress bar showing discount rate */}
                <div>
                  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${pct(data.discountStats.ordersWithDiscount, data.discountStats.totalOrders)}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {Array(4).fill(0).map((_, i) => <div key={i} className="h-5 bg-stone-100 rounded animate-pulse" />)}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
