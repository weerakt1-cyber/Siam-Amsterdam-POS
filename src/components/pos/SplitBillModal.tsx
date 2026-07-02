'use client'

import { useState } from 'react'

type SplitPayMethod = 'cash' | 'card' | 'promptpay'

type Props = {
  table: string
  total: number
  onConfirm: (method: string, received?: number) => Promise<string>
  onClose: () => void
  onComplete: () => void
}

function baht(n: number) {
  return '฿' + new Intl.NumberFormat('en').format(Math.round(n))
}

const PAY_OPTIONS: { id: SplitPayMethod; icon: string; label: string }[] = [
  { id: 'cash', icon: '💵', label: 'Cash' },
  { id: 'card', icon: '💳', label: 'Card' },
  { id: 'promptpay', icon: '📱', label: 'QR Pay' },
]

export default function SplitBillModal({ table, total, onConfirm, onClose, onComplete }: Props) {
  const [splits, setSplits] = useState(2)
  const [started, setStarted] = useState(false)
  const [paidCount, setPaidCount] = useState(0)
  const [method, setMethod] = useState<SplitPayMethod>('cash')
  const [confirming, setConfirming] = useState(false)
  const [isDone, setIsDone] = useState(false)

  const baseShare = Math.floor(total / splits)
  const remainder = total - baseShare * splits
  const currentShare = paidCount === splits - 1 ? baseShare + remainder : baseShare

  async function handlePay() {
    if (confirming) return
    if (paidCount < splits - 1) {
      setPaidCount(p => p + 1)
      return
    }
    setConfirming(true)
    try {
      await onConfirm('split')
      setIsDone(true)
    } finally {
      setConfirming(false)
    }
  }

  if (isDone) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm p-8 text-center flex flex-col items-center gap-5 shadow-2xl">
          <div className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center text-4xl">✅</div>
          <div>
            <p className="text-2xl font-black text-stone-900">All Splits Paid!</p>
            <p className="text-stone-400 mt-1 text-sm">{splits} people · {baht(total)} total</p>
          </div>
          <button onClick={onComplete} className="w-full py-4 rounded-2xl bg-stone-900 text-white font-black text-base transition active:scale-95">
            New Order →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#FAF8F4] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden border border-stone-200">

        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 bg-white">
          <div>
            <h2 className="font-bold text-stone-900">✂️ Split Bill</h2>
            <p className="text-xs text-stone-400 mt-0.5">Table {table} · {baht(total)}</p>
          </div>
          {!started && (
            <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-xl leading-none">✕</button>
          )}
        </div>

        <div className="p-5 flex flex-col gap-4">
          {!started ? (
            <>
              <p className="text-xs font-bold text-stone-400 uppercase tracking-wide">Split Between</p>
              <div className="grid grid-cols-4 gap-2">
                {[2, 3, 4, 5, 6, 7, 8, 10].map(n => (
                  <button
                    key={n}
                    onClick={() => setSplits(n)}
                    className={`py-3.5 rounded-xl font-black text-lg transition active:scale-95 border-2 ${
                      splits === n
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="bg-white border border-stone-100 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-stone-500">Each person pays ~</span>
                <span className="font-black text-2xl text-amber-600">{baht(Math.ceil(total / splits))}</span>
              </div>
              <button
                onClick={() => setStarted(true)}
                className="w-full py-4 rounded-2xl bg-stone-900 hover:bg-stone-800 active:scale-95 text-white font-black text-base transition"
              >
                Start Collecting →
              </button>
            </>
          ) : (
            <>
              <div className="bg-white border border-stone-100 rounded-xl px-4 py-3">
                <div className="flex justify-between text-sm mb-2.5">
                  <span className="text-stone-500 font-semibold">Progress</span>
                  <span className="font-bold text-stone-900">{paidCount} / {splits} paid</span>
                </div>
                <div className="flex gap-1.5">
                  {Array(splits).fill(0).map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 h-2 rounded-full transition-all ${
                        i < paidCount ? 'bg-emerald-500' : i === paidCount ? 'bg-amber-400' : 'bg-stone-200'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="text-center bg-white border border-stone-100 rounded-xl py-5 shadow-sm">
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-1.5">
                  Person {paidCount + 1} of {splits}
                </p>
                <p className="text-5xl font-black text-stone-900">{baht(currentShare)}</p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {PAY_OPTIONS.map(pm => (
                  <button
                    key={pm.id}
                    onClick={() => setMethod(pm.id)}
                    className={`py-3.5 rounded-xl border-2 transition active:scale-95 flex flex-col items-center gap-1.5 ${
                      method === pm.id
                        ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                        : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    <span className="text-xl">{pm.icon}</span>
                    <span className="text-xs font-bold">{pm.label}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={handlePay}
                disabled={confirming}
                className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-lg transition disabled:opacity-50 shadow-md shadow-emerald-200/50"
              >
                {confirming ? 'Processing...' : `✓ Paid ${baht(currentShare)}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
