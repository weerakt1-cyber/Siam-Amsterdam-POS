'use client'

import { useEffect, useRef } from 'react'

type Props = {
  label?: string
  value: string
  onChange: (v: string) => void
  onClose: () => void
  allowDecimal?: boolean
  suffix?: string
}

export default function NumPad({ label, value, onChange, onClose, allowDecimal = true, suffix }: Props) {
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
        className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm bg-slate-900 border-t border-white/10 rounded-t-3xl shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* display */}
        <div className="px-6 py-3 border-b border-white/10">
          {label && <p className="text-xs text-white/40 mb-1 font-medium">{label}</p>}
          <div className="flex items-baseline justify-end gap-2">
            {suffix && <span className="text-lg text-white/40 font-bold">{suffix}</span>}
            <span className="text-4xl font-black text-white tracking-wide tabular-nums min-h-[3rem] inline-block">
              {value || '0'}
            </span>
          </div>
        </div>

        {/* keypad grid */}
        <div className="p-4 grid grid-cols-3 gap-2.5">
          {ROWS.flat().map((key) => (
            <button
              key={key}
              onPointerDown={(e) => { e.preventDefault(); press(key) }}
              className={`h-16 rounded-2xl font-bold text-2xl transition-all active:scale-95 select-none ${
                key === '⌫'
                  ? 'bg-red-900/50 text-red-300 hover:bg-red-800/60 active:bg-red-700/60'
                  : key === 'C'
                  ? 'bg-slate-700 text-white/50 hover:bg-slate-600'
                  : key === '.'
                  ? 'bg-slate-700 text-white/70 hover:bg-slate-600 text-3xl'
                  : 'bg-slate-700/80 text-white hover:bg-slate-600 active:bg-slate-500'
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        {/* done button */}
        <div className="px-4 pb-6">
          <button
            onPointerDown={(e) => { e.preventDefault(); onClose() }}
            className="w-full h-14 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] active:bg-amber-600 text-black font-black text-lg rounded-2xl transition-all"
          >
            DONE ✓
          </button>
        </div>
      </div>
    </>
  )
}
