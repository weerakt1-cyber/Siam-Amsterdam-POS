'use client'

import { useCallback, useRef, useState } from 'react'

// Guards async button actions against double-submit and surfaces a pending flag
// for the UI. Two protections:
//   • A synchronous ref lock (`running`) blocks re-entry IMMEDIATELY on the
//     second tap — before React re-renders the disabled button — so a fast
//     double-tap on a slow tablet can't fire the action twice (no duplicate
//     orders / drawer kicks).
//   • A per-key `pending` flag drives the button's disabled + spinner state.
//
// Usage:
//   const { pending, run } = useAsyncGuard()
//   <button disabled={pending.hold} onClick={() => run('hold', handleHoldBill)}>
//
// Keys are arbitrary strings — use a stable per-action key, or suffix with an id
// (e.g. `void-${orderId}`) when the same handler runs per-row.
export function useAsyncGuard() {
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const running = useRef<Set<string>>(new Set())

  const run = useCallback(async <T,>(key: string, fn: () => Promise<T> | T): Promise<T | undefined> => {
    if (running.current.has(key)) return undefined   // already in flight — ignore the extra tap
    running.current.add(key)
    setPending(p => ({ ...p, [key]: true }))
    try {
      return await fn()
    } finally {
      running.current.delete(key)
      setPending(p => (p[key] ? { ...p, [key]: false } : p))
    }
  }, [])

  return { pending, run }
}
