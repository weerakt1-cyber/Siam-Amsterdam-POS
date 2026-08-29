'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/pos-auth'
import { useShift, STAFF_ROLES } from '@/lib/pos-shift'

// Clock-in gate: a staff/bartender with no open shift is redirected to the
// My Shift screen — the POS stays locked until they clock in. Clocking out
// (shift → null) sends them back here. Managers/admins are unaffected.
export default function ShiftGate() {
  const { user } = useAuth()
  const ctx = useShift()
  const path = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!ctx || !user || ctx.loading) return
    if (!STAFF_ROLES.has(user.role)) return
    if (!ctx.shift && path !== '/pos/shift') router.replace('/pos/shift')
  }, [ctx, user, path, router])

  return null
}
