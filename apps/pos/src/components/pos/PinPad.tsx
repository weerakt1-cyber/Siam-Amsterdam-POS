'use client'

import { useState, useEffect } from 'react'

/**
 * PinPad — full-screen centered PIN entry card, matching the User-switch PIN
 * screen (big rectangular keys, easy to tap). Reusable for any 4-digit PIN
 * gate. The parent verifies the entered PIN via `onVerify` (async → true if
 * correct); a wrong PIN flashes red and clears.
 */
export default function PinPad({
  heading,
  subtext,
  onClose,
  onVerify,
}: {
  heading?: string
  subtext?: string
  onClose: () => void
  onVerify: (pin: string) => Promise<boolean>
}) {
  const [pin, setPin]           = useState('')
  const [error, setError]       = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (pin.length !== 4 || checking) return
    setChecking(true)
    onVerify(pin)
      .then(ok => {
        if (!ok) { setError(true); setTimeout(() => { setError(false); setPin('') }, 800) }
        // on success the parent unmounts this component
      })
      .catch(() => { setError(true); setTimeout(() => { setError(false); setPin('') }, 800) })
      .finally(() => setChecking(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div
      className="fixed inset-0 bg-[#FAF8F4]/95 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-4"
      onPointerDown={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[96vh] overflow-y-auto"
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <span className="text-lg font-bold text-stone-900">{heading ?? '🔒 Enter PIN'}</span>
          <button onPointerDown={onClose} className="text-stone-400 hover:text-stone-700 text-2xl leading-none">✕</button>
        </div>

        <div className="px-5 sm:px-8 pb-6 pt-3">
          {subtext && <p className="text-sm text-stone-400 text-center mb-1">{subtext}</p>}

          <div className="flex justify-center gap-4 py-3">
            {Array(4).fill(0).map((_, i) => (
              <div
                key={i}
                className={`w-6 h-6 rounded-full transition-all duration-100 ${
                  error       ? 'bg-red-500 scale-110' :
                  i < pin.length ? 'bg-amber-500 scale-110' : 'bg-stone-200'
                }`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mt-2 w-full max-w-2xl mx-auto">
            {KEYS.map((k, i) => (
              <button
                key={i}
                onPointerDown={() => {
                  if (k === '⌫') { setPin(p => p.slice(0, -1)); setError(false) }
                  else if (k && pin.length < 4) setPin(p => p + k)
                }}
                disabled={checking}
                className={`h-20 sm:h-24 rounded-2xl text-4xl font-semibold transition-all active:scale-95 disabled:opacity-50 ${
                  k === '' ? 'invisible' :
                  k === '⌫' ? 'bg-stone-100 text-stone-500 hover:bg-stone-200' :
                  'bg-stone-50 text-stone-900 border border-stone-200 hover:bg-stone-100 hover:border-stone-400'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
