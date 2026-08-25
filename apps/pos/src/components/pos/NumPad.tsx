'use client'

import { useEffect, useRef } from 'react'

type Props = {
  label?: string
  value: string
  onChange: (v: string) => void
  onClose: () => void
  allowDecimal?: boolean
  suffix?: string
  mask?: boolean   // show • instead of the digits (for PIN entry)
}

export default function NumPad({ label, value, onChange, onClose, allowDecimal = true, suffix, mask = false }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  // ป้องกัน scroll body ขณะ numpad เปิดอยู่
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  function press(key: string) {
    if (key === 'C') { onChange(''); return }
    if (key === '⌫') { onChange(value.slice(0, -1)); return }
    if (key === '.') {
      if (!allowDecimal || value.includes('.')) return
      onChange(value === '' ? '0.' : value + '.')
      return
    }
    // ป้องกัน leading zero (ยกเว้น "0.")
    if (value === '0') { onChange(key); return }
    onChange(value + key)
  }

  const ROWS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [allowDecimal ? '.' : 'C', '0', '⌫'],
  ]

  return (
    <>
      {/* backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" onPointerDown={onClose} />

      {/* bottom sheet */}
      <div
        ref={panelRef}
        className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-md bg-slate-900 border-t border-white/10 rounded-t-3xl shadow-2xl pb-[env(safe-area-inset-bottom)]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-white/25 rounded-full" />
        </div>

        {/* display */}
        <div className="px-6 py-4 border-b border-white/10">
          {label && <p className="text-sm text-white/50 mb-1.5 font-semibold">{label}</p>}
          <div className="flex items-baseline justify-end gap-2">
            {suffix && <span className="text-2xl text-white/40 font-bold">{suffix}</span>}
            <span className="text-5xl font-black text-white tracking-wide tabular-nums min-h-[3.5rem] inline-block">
              {mask ? (value ? '•'.repeat(value.length) : '0') : (value || '0')}
            </span>
          </div>
        </div>

        {/* keypad grid */}
        <div className="px-4 pt-4 grid grid-cols-3 gap-3">
          {ROWS.flat().map((key) => (
            <button
              key={key}
              onPointerDown={(e) => { e.preventDefault(); press(key) }}
              className={`h-[4.75rem] rounded-2xl font-bold text-3xl transition-all duration-75 active:scale-90 select-none touch-manipulation shadow-sm ${
                key === '⌫'
                  ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25 active:bg-red-500/35'
                  : key === 'C'
                  ? 'bg-slate-700/70 text-white/60 hover:bg-slate-600 active:bg-slate-500'
                  : key === '.'
                  ? 'bg-slate-700/70 text-white/80 hover:bg-slate-600 active:bg-slate-500 text-4xl'
                  : 'bg-slate-700 text-white hover:bg-slate-600 active:bg-amber-500 active:text-black'
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        {/* done button */}
        <div className="px-4 pt-3 pb-6">
          <button
            onPointerDown={(e) => { e.preventDefault(); onClose() }}
            className="w-full h-16 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] active:bg-amber-600 text-black font-black text-xl rounded-2xl transition-all shadow-lg shadow-amber-500/20"
          >
            DONE ✓
          </button>
        </div>
      </div>
    </>
  )
}
