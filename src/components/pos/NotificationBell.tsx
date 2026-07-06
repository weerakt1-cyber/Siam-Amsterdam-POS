'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Alert, AlertSeverity } from '@/lib/alerts'
import { loadBarSettings } from '@/lib/printer'

const POLL_MS = 90_000
const SEEN_KEY = 'pos_alerts_seen'

const SEV_STYLES: Record<AlertSeverity, { dot: string; chip: string; ring: string }> = {
  critical: { dot: 'bg-red-500',     chip: 'bg-red-50 border-red-100 text-red-700',        ring: 'ring-red-200' },
  warning:  { dot: 'bg-amber-500',   chip: 'bg-amber-50 border-amber-100 text-amber-700',  ring: 'ring-amber-200' },
  info:     { dot: 'bg-sky-500',     chip: 'bg-sky-50 border-sky-100 text-sky-700',        ring: 'ring-sky-200' },
  success:  { dot: 'bg-emerald-500', chip: 'bg-emerald-50 border-emerald-100 text-emerald-700', ring: 'ring-emerald-200' },
}

function loadSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')) } catch { return new Set() }
}
function saveSeen(ids: string[]) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)) } catch { /* ignore */ }
}

export default function NotificationBell() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [open, setOpen]     = useState(false)
  const [seen, setSeen]     = useState<Set<string>>(new Set())

  useEffect(() => { setSeen(loadSeen()) }, [])

  const fetchAlerts = useCallback(async () => {
    try {
      const s = loadBarSettings()
      const qs = new URLSearchParams({
        daily:   String(s.dailyRevenueTarget ?? 0),
        weekly:  String(s.weeklyRevenueTarget ?? 0),
        monthly: String(s.monthlyRevenueTarget ?? 0),
      })
      const r = await fetch(`/api/alerts?${qs}`)
      if (!r.ok) return
      const d = await r.json()
      setAlerts(Array.isArray(d.alerts) ? d.alerts : [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchAlerts()
    const iv = setInterval(fetchAlerts, POLL_MS)
    const onFocus = () => fetchAlerts()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(iv); window.removeEventListener('focus', onFocus) }
  }, [fetchAlerts])

  // "Problems" badge excludes pure success (target-hit) items.
  const actionable = alerts.filter(a => a.severity !== 'success')
  const hasNew     = alerts.some(a => !seen.has(a.id))
  const hasUrgent  = actionable.some(a => a.severity === 'critical' || a.severity === 'warning')

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) {
      // Mark everything currently shown as seen (clears the "new" pulse).
      const ids = alerts.map(a => a.id)
      setSeen(new Set(ids))
      saveSeen(ids)
    }
  }

  return (
    <>
      {/* Floating bell — bottom-left, clears the sidebar on desktop, mirrors the AI chat button */}
      <button
        onClick={toggle}
        title="Notifications & alerts"
        className={`fixed z-[65] bottom-20 left-4 sm:bottom-6 sm:left-20 w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-2xl bg-white border border-stone-200 transition-all active:scale-95 ${
          hasNew && hasUrgent ? 'ring-4 ring-red-200 animate-pulse' : ''
        }`}
      >
        🔔
        {actionable.length > 0 && (
          <span className={`absolute -top-1 -right-1 min-w-[22px] h-[22px] rounded-full text-white text-xs font-black flex items-center justify-center px-1 shadow ${
            hasUrgent ? 'bg-red-500' : 'bg-sky-500'
          }`}>
            {actionable.length}
          </span>
        )}
        {actionable.length === 0 && alerts.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[64]" onClick={() => setOpen(false)} />
          <div className="fixed z-[66] bottom-36 left-4 sm:bottom-24 sm:left-20 w-[calc(100vw-2rem)] max-w-sm bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[70vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔔</span>
                <h3 className="font-bold text-stone-900">Alerts</h3>
                {actionable.length > 0 && (
                  <span className="text-xs font-bold text-stone-400">{actionable.length} to review</span>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-700 text-xl leading-none w-7 h-7 flex items-center justify-center">×</button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-stone-300 gap-2">
                  <span className="text-4xl">✅</span>
                  <p className="text-sm font-medium text-stone-400">All clear — no alerts</p>
                  <p className="text-xs text-stone-300">Stock, targets, and sales look healthy</p>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-stone-50">
                  {alerts.map(a => {
                    const s = SEV_STYLES[a.severity]
                    return (
                      <div key={a.id} className="flex items-start gap-3 px-4 py-3">
                        <span className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 border ${s.chip}`}>
                          {a.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-stone-900 leading-snug">{a.title}</p>
                          <p className="text-xs text-stone-500 leading-snug mt-0.5">{a.detail}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-stone-100 bg-stone-50/60 shrink-0 flex items-center justify-between">
              <span className="text-[10px] text-stone-400">Auto-refreshes every 90s</span>
              <button onClick={fetchAlerts} className="text-xs font-semibold text-stone-500 hover:text-stone-800 transition">
                ↻ Refresh
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
