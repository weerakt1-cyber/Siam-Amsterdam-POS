'use client'

import { authedFetch } from "@/lib/supabase-browser"
import { useState, useEffect, useCallback } from 'react'
import type { DailyReport, Order, ExpenseCategory } from '@/lib/types'
import NumPad from '@/components/pos/NumPad'
import { generateDailyReportPDF } from '@/lib/pdf-report'
import { usePosLang } from '@/lib/pos-i18n'
import { printReceipt, loadBarSettings, type ReceiptData } from '@/lib/printer'
import { businessDayOf } from '@/lib/business-day'
import { Skeleton, SkeletonList } from '@/components/pos/Skeleton'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

// "Today" for cash reconciliation = the store's current business day, so a
// night that runs past midnight counts as one day (matches the till count).
function today() {
  return businessDayOf(new Date(), loadBarSettings().businessDayCutoff)
}

function displayDate(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function baht(n: number) {
  return '฿' + new Intl.NumberFormat('en').format(Math.round(n))
}

const EXPENSE_CATS: { value: ExpenseCategory; label: string; icon: string }[] = [
  { value: 'supplies', label: 'Supplies',   icon: '📦' },
  { value: 'food',     label: 'Food/Stock', icon: '🛒' },
  { value: 'utilities',label: 'Utilities',  icon: '⚡' },
  { value: 'salary',   label: 'Salary',     icon: '👤' },
  { value: 'rent',     label: 'Rent',       icon: '🏠' },
  { value: 'other',    label: 'Other',      icon: '🔖' },
]

function catInfo(cat: ExpenseCategory) {
  return EXPENSE_CATS.find(c => c.value === cat) ?? EXPENSE_CATS[5]
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportToCSV(date: string, report: DailyReport, orders: Order[], summary: ReturnType<typeof calcSummary>) {
  const lines: string[] = []

  lines.push(`DAILY REPORT — ${displayDate(date)}`)
  lines.push('')
  lines.push('=== SUMMARY ===')
  lines.push(`Opening Cash,${report.openingCash}`)
  lines.push(`Order Revenue,${summary.orderRevenue}`)
  lines.push(`Cash In Total,${summary.cashInTotal}`)
  lines.push(`Expenses Total,${summary.expenseTotal}`)
  lines.push(`Closing Balance,${summary.closingBalance}`)
  lines.push('')

  lines.push('=== ORDERS ===')
  lines.push('Time,Table,Items,Payment,Total')
  orders.forEach(o => {
    const time = new Date(o.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const items = o.items.map(i => `${i.name} x${i.qty}`).join('; ')
    lines.push(`${time},${o.tableNo},"${items}",${o.paymentMethod ?? 'cash'},${o.total}`)
  })
  lines.push(`,,,,TOTAL: ${summary.orderRevenue}`)
  lines.push('')

  lines.push('=== CASH IN ===')
  lines.push('Time,Note,Amount')
  report.cashIns.forEach(e => {
    const time = new Date(e.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    lines.push(`${time},"${e.note}",${e.amount}`)
  })
  lines.push(`,,TOTAL: ${summary.cashInTotal}`)
  lines.push('')

  lines.push('=== EXPENSES ===')
  lines.push('Time,Category,Note,Amount')
  report.expenses.forEach(e => {
    const time = new Date(e.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    lines.push(`${time},${e.category},"${e.note}",${e.amount}`)
  })
  lines.push(`,,,TOTAL: ${summary.expenseTotal}`)

  const csv = lines.join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cash-report-${date}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Summary calc ─────────────────────────────────────────────────────────────

function calcSummary(report: DailyReport, orders: Order[]) {
  const orderRevenue = orders.filter(o => o.status === 'paid').reduce((s, o) => s + o.total, 0)
  const cashInTotal = report.cashIns.reduce((s, e) => s + e.amount, 0)
  const expenseTotal = report.expenses.reduce((s, e) => s + e.amount, 0)
  const closingBalance = report.openingCash + cashInTotal + orderRevenue - expenseTotal
  return { orderRevenue, cashInTotal, expenseTotal, closingBalance }
}

// ─── Modal for adding entries ─────────────────────────────────────────────────

type AddModalType = 'cash-in' | 'expense' | null

function AddModal({
  type, onClose, onSave,
}: {
  type: AddModalType
  onClose: () => void
  onSave: (amount: number, note: string, category?: ExpenseCategory) => void
}) {
  const { t } = usePosLang()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('supplies')
  const [showNumPad, setShowNumPad] = useState(false)

  if (!type) return null

  function submit() {
    const n = parseInt(amount)
    if (!n || n <= 0) return
    onSave(n, note, type === 'expense' ? category : undefined)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-end justify-center">
      <div className="bg-white rounded-t-2xl shadow-2xl w-full max-w-lg p-5 pb-8 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">{type === 'cash-in' ? `📥 ${t('cashAddCashIn')}` : `📤 ${t('cashAddExpense')}`}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-800 text-xl leading-none">✕</button>
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs text-stone-500 mb-1 block">Amount (฿) *</label>
          <button
            onClick={() => setShowNumPad(true)}
            className={`w-full text-left bg-stone-50 border rounded-xl px-4 py-3 font-bold text-lg transition ${
              amount ? 'text-amber-600 border-amber-400' : 'text-stone-400 border-stone-200'
            }`}
          >
            {amount ? `฿${parseInt(amount).toLocaleString()}` : 'Tap to enter amount'}
          </button>
        </div>

        {/* Note */}
        <div>
          <label className="text-xs text-stone-500 mb-1 block">Note</label>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={type === 'cash-in' ? 'e.g. Bank top-up' : 'e.g. Ice from market'}
            className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-900 outline-none focus:border-amber-400 transition"
          />
        </div>

        {/* Category (expense only) */}
        {type === 'expense' && (
          <div>
            <label className="text-xs text-stone-500 mb-2 block">Category</label>
            <div className="grid grid-cols-3 gap-2">
              {EXPENSE_CATS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={`py-2 rounded-xl text-sm font-semibold transition ${
                    category === c.value
                      ? 'bg-amber-100 text-amber-700 border border-amber-400'
                      : 'bg-stone-100 text-stone-500 border border-stone-200 hover:text-stone-800 hover:bg-stone-200'
                  }`}
                >
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={submit}
          disabled={!amount || parseInt(amount) <= 0}
          className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-base transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {type === 'cash-in' ? t('cashAddCashIn') : t('cashAddExpense')}
        </button>
      </div>

      {showNumPad && (
        <NumPad
          label={type === 'cash-in' ? t('cashInAmount') : t('cashExpenseAmount')}
          value={amount}
          onChange={setAmount}
          onClose={() => setShowNumPad(false)}
          allowDecimal={false}
          suffix="฿"
        />
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CashPage() {
  const { t } = usePosLang()
  const [date, setDate] = useState(today())
  const [report, setReport] = useState<DailyReport>({ date, openingCash: 0, cashIns: [], expenses: [], updatedAt: '' })
  const [orders, setOrders] = useState<Order[]>([])
  const [modal, setModal] = useState<AddModalType>(null)
  const [showOpeningNumPad, setShowOpeningNumPad] = useState(false)
  const [openingVal, setOpeningVal] = useState('')
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [printing, setPrinting] = useState(false)

  const fetchReport = useCallback(async (d: string) => {
    setIsLoading(true)
    try {
      const r = await authedFetch(`/api/reports/${d}`).then(res => res.json())
      setReport(r.report)
      setOrders(r.orders ?? [])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchReport(date) }, [date, fetchReport])

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  // Void an order from the day's list (e.g. a mistaken/duplicate bill). Sets it
  // to 'cancelled' so it drops out of the paid revenue; reversible only by re-entry.
  async function voidOrder(o: Order) {
    if (!confirm(t('cashConfirmVoid'))) return
    setVoiding(true)
    try {
      const r = await authedFetch(`/api/orders/${o.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!r.ok) { showToast(t('toastVoidFail'), false); return }
      await fetchReport(date)
      setDetailOrder(null)
      showToast(t('toastOrderVoided'))
    } catch {
      showToast(t('toastVoidFail'), false)
    } finally {
      setVoiding(false)
    }
  }

  // Reprint an order's receipt from the day's list (in case the original slip
  // was lost) via the thermal printer — same path as checkout.
  async function reprintOrder(o: Order) {
    setPrinting(true)
    try {
      const data: ReceiptData = {
        orderId:        o.id,
        tableNo:        o.tableNo,
        createdAt:      o.createdAt,
        memberName:     o.memberName || undefined,
        items:          o.items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
        subtotal:       o.subtotal,
        discountAmount: o.discount?.amount ?? 0,
        total:          o.total,
        vatIncluded:    Math.round(o.total * 7 / 107),
        paymentMethod:  o.paymentMethod,
        note:           o.note || undefined,
      }
      await printReceipt(data, loadBarSettings())
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('toastPrintFailed'), false)
    } finally {
      setPrinting(false)
    }
  }

  function shiftDate(days: number) {
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() + days)
    setDate(toDateStr(d))
  }

  async function callReport(body: object) {
    const r = await authedFetch(`/api/reports/${date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await r.json()
    if (!r.ok) return showToast(data.error ?? 'Error', false)
    setReport(data.report)
    return data.report
  }

  async function saveOpening() {
    const amount = parseInt(openingVal) || 0
    await callReport({ action: 'opening', amount })
    showToast(`Opening cash set to ${baht(amount)}`)
    setShowOpeningNumPad(false)
  }

  async function handleAdd(amount: number, note: string, category?: ExpenseCategory) {
    if (modal === 'cash-in') {
      await callReport({ action: 'add-cash-in', amount, note })
      showToast(`Cash in ${baht(amount)} added`)
    } else {
      await callReport({ action: 'add-expense', amount, note, category })
      showToast(`Expense ${baht(amount)} added`)
    }
  }

  async function removeCashIn(id: string) {
    await callReport({ action: 'remove-cash-in', entryId: id })
  }

  async function removeExpense(id: string) {
    await callReport({ action: 'remove-expense', entryId: id })
  }

  const summary  = calcSummary(report, orders)
  const isToday  = date === today()
  const hasData  = report.openingCash > 0 || report.cashIns.length > 0 || report.expenses.length > 0 || orders.length > 0

  function handleExportPDF() {
    if (pdfLoading) return
    setPdfLoading(true)
    try {
      generateDailyReportPDF(date, report, orders)
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-stone-50 text-stone-900">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-2xl font-semibold text-sm pointer-events-none ${toast.ok ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.ok ? '✓' : '✗'} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="px-5 pt-4 pb-3 bg-white border-b border-stone-200 shrink-0 flex items-center justify-between gap-3">
        {/* Date nav */}
        <div className="flex items-center gap-3">
          <button onClick={() => shiftDate(-1)} className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600 hover:text-stone-900 transition">‹</button>
          <div className="text-center">
            <p className="font-bold text-base leading-tight text-stone-900">{displayDate(date)}</p>
            {isToday && <span className="text-xs text-amber-500 font-semibold">{t('cashToday')}</span>}
          </div>
          <button
            onClick={() => shiftDate(+1)}
            disabled={isToday}
            className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600 hover:text-stone-900 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >›</button>
        </div>

        <div className="flex gap-2">
          {!isToday && (
            <button onClick={() => setDate(today())} className="text-xs px-3 py-2 rounded-xl border border-amber-400 text-amber-600 font-semibold hover:bg-amber-50 transition">
              {t('cashGoToday')}
            </button>
          )}
          <button
            onClick={() => exportToCSV(date, report, orders, summary)}
            className="text-xs px-3 py-2 rounded-xl border border-stone-200 text-stone-500 hover:text-stone-800 hover:border-gray-400 font-semibold transition active:scale-95"
          >
            ⬇ CSV
          </button>
          {!isLoading && hasData && (
            <button
              onClick={handleExportPDF}
              disabled={pdfLoading}
              className="text-xs px-3 py-2 rounded-xl border border-red-200 text-red-500 hover:text-red-700 hover:bg-red-50 hover:border-red-400 font-semibold transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pdfLoading ? '⏳ …' : '📄 PDF'}
            </button>
          )}
        </div>
      </div>

      {/* Summary Bar */}
      <div className="px-5 py-3 bg-stone-50 border-b border-stone-200 grid grid-cols-5 gap-3 shrink-0">
        {[
          { label: t('cashOpeningCash'), value: baht(report.openingCash), color: 'text-stone-700', action: () => { setOpeningVal(String(report.openingCash || '')); setShowOpeningNumPad(true) } },
          { label: t('cashOrderRevenue'), value: baht(summary.orderRevenue), color: 'text-emerald-400', action: undefined },
          { label: t('cashInLabel'), value: baht(summary.cashInTotal), color: 'text-blue-400', action: undefined },
          { label: t('cashExpenses'), value: baht(summary.expenseTotal), color: 'text-red-400', action: undefined },
          { label: t('cashClosing'), value: baht(summary.closingBalance), color: summary.closingBalance >= 0 ? 'text-amber-400' : 'text-red-400', action: undefined },
        ].map(({ label, value, color, action }) => (
          <button
            key={label}
            onClick={action}
            className={`text-center rounded-xl p-2.5 transition ${action ? 'bg-white hover:bg-amber-50 cursor-pointer border border-stone-200 hover:border-amber-400' : 'bg-white cursor-default border border-stone-100'}`}
          >
            <p className={`text-lg font-black leading-tight ${color}`}>{value}</p>
            <p className="text-xs text-stone-400 mt-0.5">{label}</p>
            {action && <p className="text-xs text-amber-500/60 mt-0.5">{t('cashTapEdit')}</p>}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-5 grid grid-cols-2 gap-5 max-w-4xl">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-6 w-32" />
              <SkeletonList rows={4} avatar={false} />
              <Skeleton className="h-6 w-32 mt-2" />
              <SkeletonList rows={3} avatar={false} />
            </div>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-6 w-24" />
              <SkeletonList rows={6} avatar={false} />
            </div>
          </div>
        ) : (
          <div className="p-5 grid grid-cols-2 gap-5 max-w-4xl">

            {/* ── Left column ── */}
            <div className="flex flex-col gap-5">

              {/* Cash In */}
              <Section
                title={`📥 ${t('cashInLabel')}`}
                total={summary.cashInTotal}
                onAdd={() => setModal('cash-in')}
                addLabel={`+ ${t('cashAddCashIn')}`}
                addColor="bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                empty={t('cashNoCashIn')}
              >
                {report.cashIns.map(e => (
                  <EntryRow
                    key={e.id}
                    icon="📥"
                    label={e.note || 'Cash In'}
                    amount={e.amount}
                    time={e.createdAt}
                    onRemove={() => removeCashIn(e.id)}
                    amountColor="text-blue-400"
                  />
                ))}
              </Section>

              {/* Expenses */}
              <Section
                title={`📤 ${t('cashExpenses')}`}
                total={summary.expenseTotal}
                onAdd={() => setModal('expense')}
                addLabel={`+ ${t('cashAddExpense')}`}
                addColor="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                empty={t('cashNoExpenses')}
              >
                {report.expenses.map(e => {
                  const cat = catInfo(e.category)
                  return (
                    <EntryRow
                      key={e.id}
                      icon={cat.icon}
                      label={e.note || cat.label}
                      sublabel={cat.label}
                      amount={e.amount}
                      time={e.createdAt}
                      onRemove={() => removeExpense(e.id)}
                      amountColor="text-red-400"
                    />
                  )
                })}
              </Section>

            </div>

            {/* ── Right column: Orders ── */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-stone-600 uppercase tracking-wider">📋 {t('cashOrders')}</h3>
                  <p className="text-xs text-stone-400 mt-0.5">{orders.length} {t('cashOrdersCount')} · {orders.filter(o => o.status === 'paid').length} {t('cashOrdersPaid')}</p>
                </div>
                <span className="text-base font-black text-emerald-400">{baht(summary.orderRevenue)}</span>
              </div>

              {orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-stone-300">
                  <p className="text-4xl mb-2">🧾</p>
                  <p className="text-sm">{t('cashNoOrders')}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {orders.map(o => (
                    <button key={o.id} onClick={() => setDetailOrder(o)} className="w-full text-left bg-white border border-stone-100 rounded-xl px-4 py-3 flex items-start justify-between gap-3 hover:border-amber-300 hover:bg-amber-50/40 transition active:scale-[0.99]">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-amber-400">{t('cbTable')} {o.tableNo}</span>
                          <span className="text-xs text-stone-400 font-mono">#{o.id.slice(-6)}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                            o.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'
                          }`}>{o.status}</span>
                        </div>
                        <p className="text-xs text-stone-500 truncate">
                          {o.items.map(i => `${i.name} ×${i.qty}`).join(', ')}
                        </p>
                        {o.paymentMethod && (
                          <p className="text-xs text-stone-400 mt-0.5 capitalize">💳 {o.paymentMethod}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-bold text-sm ${o.status === 'paid' ? 'text-emerald-600' : 'text-stone-400'}`}>{baht(o.total)}</p>
                        <p className="text-xs text-stone-400">
                          {new Date(o.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* Opening Cash NumPad */}
      {showOpeningNumPad && (
        <NumPad
          label={t('cashOpeningCash')}
          value={openingVal}
          onChange={setOpeningVal}
          onClose={saveOpening}
          allowDecimal={false}
          suffix="฿"
        />
      )}

      {/* Order detail modal — tap a bill to view, reprint, or void it */}
      {detailOrder && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setDetailOrder(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg p-5 pb-8 flex flex-col gap-4 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">🧾 {t('cashOrderDetail')}</h3>
              <button onClick={() => setDetailOrder(null)} className="text-stone-400 hover:text-stone-800 text-xl leading-none">✕</button>
            </div>

            <div className="flex items-center flex-wrap gap-2 text-sm">
              <span className="font-bold text-stone-800">{t('cbTable')} {detailOrder.tableNo}</span>
              <span className="text-stone-400 font-mono">#{detailOrder.id.slice(-6)}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                detailOrder.status === 'paid' ? 'bg-emerald-100 text-emerald-700'
                : detailOrder.status === 'cancelled' ? 'bg-red-100 text-red-600'
                : 'bg-stone-100 text-stone-500'
              }`}>{detailOrder.status === 'cancelled' ? t('cashVoided') : detailOrder.status}</span>
              <span className="text-stone-400 text-xs ml-auto">
                {new Date(detailOrder.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <div className="border-t border-stone-100 pt-3 flex flex-col gap-1.5">
              {detailOrder.items.map((i, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-stone-700">{i.name}{i.variantLabel ? ` (${i.variantLabel})` : ''} <span className="text-stone-400">×{i.qty}</span></span>
                  <span className="text-stone-600 tabular-nums">{baht(i.price * i.qty)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-stone-100 pt-3 flex flex-col gap-1 text-sm">
              <div className="flex justify-between text-stone-500"><span>{t('cbSubtotal')}</span><span className="tabular-nums">{baht(detailOrder.subtotal)}</span></div>
              {detailOrder.discount && detailOrder.discount.amount > 0 && (
                <div className="flex justify-between text-emerald-600"><span>{t('cbDiscount')}</span><span className="tabular-nums">-{baht(detailOrder.discount.amount)}</span></div>
              )}
              <div className="flex justify-between font-black text-stone-900 text-base"><span>{t('cbTotal')}</span><span className="tabular-nums">{baht(detailOrder.total)}</span></div>
              {detailOrder.paymentMethod && (
                <div className="flex justify-between text-stone-400 text-xs mt-0.5"><span>💳 {detailOrder.paymentMethod}</span></div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => reprintOrder(detailOrder)}
                disabled={printing}
                className="flex-1 py-3 rounded-xl bg-stone-900 text-white font-bold text-sm transition active:scale-95 disabled:opacity-50"
              >
                🖨️ {printing ? t('cashPrinting') : t('cashPrintReceipt')}
              </button>
              {detailOrder.status !== 'cancelled' && (
                <button
                  onClick={() => voidOrder(detailOrder)}
                  disabled={voiding}
                  className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 font-bold text-sm hover:bg-red-50 transition active:scale-95 disabled:opacity-50"
                >
                  ✕ {t('cashVoid')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      <AddModal
        type={modal}
        onClose={() => setModal(null)}
        onSave={handleAdd}
      />
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  title, total, onAdd, addLabel, addColor, empty, children,
}: {
  title: string
  total: number
  onAdd: () => void
  addLabel: string
  addColor: string
  empty: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-stone-600 uppercase tracking-wider">{title}</h3>
        <span className="font-black text-base text-stone-700">{baht(total)}</span>
      </div>
      <button
        onClick={onAdd}
        className={`w-full py-2 rounded-xl font-bold text-sm transition active:scale-95 ${addColor}`}
      >
        {addLabel}
      </button>
      {React.Children.count(children) === 0 ? (
        <p className="text-xs text-stone-300 text-center py-3">{empty}</p>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </div>
  )
}

import React from 'react'

function EntryRow({
  icon, label, sublabel, amount, time, onRemove, amountColor,
}: {
  icon: string
  label: string
  sublabel?: string
  amount: number
  time: string
  onRemove: () => void
  amountColor: string
}) {
  return (
    <div className="flex items-center gap-3 bg-white border border-stone-100 rounded-xl px-3 py-2.5">
      <span className="text-lg shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate text-stone-900">{label}</p>
        <p className="text-xs text-stone-400">
          {sublabel && <span className="mr-1">{sublabel} ·</span>}
          {new Date(time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      <span className={`font-bold text-sm shrink-0 ${amountColor}`}>{baht(amount)}</span>
      <button
        onClick={onRemove}
        className="w-7 h-7 shrink-0 rounded-lg bg-stone-100 hover:bg-red-50 text-stone-400 hover:text-red-500 flex items-center justify-center text-xs transition"
      >
        ✕
      </button>
    </div>
  )
}
