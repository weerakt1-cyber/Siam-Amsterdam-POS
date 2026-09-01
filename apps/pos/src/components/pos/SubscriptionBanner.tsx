'use client'

import { useEffect, useState } from 'react'
import { authedFetch } from '@/lib/supabase-browser'
import { usePosLang } from '@/lib/pos-i18n'

type Sub = { plan: string; status: string; until: string | null; daysLeft: number | null }

// Show the renewal warning once the package is within this many days of expiry.
const WARN_DAYS = 7

// Phase 0 (manual billing): a SOFT, non-blocking banner. It only appears when the
// package is expiring soon or already past due — otherwise it renders nothing and
// never interferes with using the POS. Renewal is handled out-of-band by the
// owner (see migration 019).
export default function SubscriptionBanner() {
  const { lang } = usePosLang()
  const L = (en: string, th: string) => (lang === 'en' ? en : th)
  const [sub, setSub] = useState<Sub | null>(null)

  useEffect(() => {
    authedFetch('/api/store/subscription')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && !d.error) setSub(d) })
      .catch(() => {})
  }, [])

  if (!sub) return null

  const { until, status, daysLeft } = sub
  const expired  = status === 'expired' || (daysLeft != null && daysLeft < 0)
  const expiring = !expired && daysLeft != null && daysLeft <= WARN_DAYS
  if (!expired && !expiring) return null   // active & comfortably in date → nothing

  const cls = expired
    ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-amber-50 text-amber-800 border-amber-200'

  const msg = expired
    ? L(`⚠️ Your store's package has expired${until ? ` (${until})` : ''} — please renew with your admin (the POS still works as usual)`,
        `⚠️ แพ็คเกจของร้านหมดอายุแล้ว${until ? ` (${until})` : ''} — กรุณาต่ออายุกับผู้ดูแลระบบ (ระบบยังใช้งานได้ตามปกติ)`)
    : L(`⏳ Your package expires in ${daysLeft} days${until ? ` (${until})` : ''} — please renew with your admin`,
        `⏳ แพ็คเกจจะหมดอายุใน ${daysLeft} วัน${until ? ` (${until})` : ''} — กรุณาต่ออายุกับผู้ดูแลระบบ`)

  return (
    <div className={`shrink-0 border-b px-4 py-2 text-center text-xs font-semibold ${cls}`} role="status">
      {msg}
    </div>
  )
}
