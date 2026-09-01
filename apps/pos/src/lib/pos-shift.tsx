'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authedFetch } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/pos-auth'

export type ShiftBreakType = 'meal' | 'restroom' | 'other'
export type ShiftBreak = { start: string; end: string | null; type: ShiftBreakType }
export type Shift = {
  id: string; staffId: string; clockIn: string; clockOut: string | null
  breaks: ShiftBreak[]; status: 'open' | 'closed'; autoClosed: boolean
} | null

// Pure operator roles — a stripped-down app (POS + their own shift).
export const STAFF_ROLES = new Set(['staff', 'bartender'])
// Roles required to clock in before using the app. Managers clock in too (they
// land on the Manager Dashboard afterwards); admins/owners are exempt.
export const CLOCK_IN_ROLES = new Set(['staff', 'bartender', 'manager'])

type Ctx = {
  shift: Shift
  loading: boolean
  onBreak: boolean
  refresh: () => Promise<void>
  act: (action: 'clock_in' | 'break_start' | 'break_end' | 'clock_out', type?: ShiftBreakType) => Promise<void>
}
const ShiftCtx = createContext<Ctx | null>(null)
export const useShift = () => useContext(ShiftCtx)

export function ShiftProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [shift, setShift] = useState<Shift>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) { setShift(null); setLoading(false); return }
    setLoading(true)
    try {
      const r = await authedFetch(`/api/shift?staffId=${encodeURIComponent(user.id)}`)
      if (r.ok) setShift((await r.json()).shift ?? null)
    } catch { /* keep last known */ } finally { setLoading(false) }
  }, [user])

  useEffect(() => { refresh() }, [refresh])

  const act = useCallback<Ctx['act']>(async (action, type) => {
    if (!user) return
    const r = await authedFetch('/api/shift', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: user.id, action, type }),
    })
    if (r.ok) setShift((await r.json()).shift ?? null)
  }, [user])

  const onBreak = !!shift?.breaks.some(b => !b.end)

  return <ShiftCtx.Provider value={{ shift, loading, onBreak, refresh, act }}>{children}</ShiftCtx.Provider>
}
