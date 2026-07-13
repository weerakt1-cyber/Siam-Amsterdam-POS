'use client'

import { useState, useEffect } from 'react'
import type { ActiveUser } from '@/lib/pos-auth'

type StaffUser = { id: string; name: string; role: string; color: string }

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', bartender: 'Bartender', staff: 'Staff',
}

function PinDots({ count, error }: { count: number; error?: boolean }) {
  return (
    <div className="flex justify-center gap-4 py-4">
      {Array(4).fill(0).map((_, i) => (
        <div
          key={i}
          className={`w-5 h-5 rounded-full transition-all duration-100 ${
            error     ? 'bg-red-500 scale-110' :
            i < count ? 'bg-amber-500 scale-110' : 'bg-stone-200'
          }`}
        />
      ))}
    </div>
  )
}

export default function UserSwitcher({
  onLogin, onLogout, onClose, mode = 'switch', lockUser, heading, subtext,
}: {
  onLogin:  (u: ActiveUser) => void
  onLogout: () => void
  onClose?: () => void
  mode?:    'switch' | 'lock'  // 'lock' = mandatory, no dismiss (inactivity lock or first-time user select)
  lockUser?: ActiveUser | null // preselected user (optional) when opened as a lock screen
  heading?: string             // overrides the panel title
  subtext?: string             // overrides the sub-line under the title
}) {
  const [users, setUsers]         = useState<StaffUser[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [step, setStep]           = useState<'pick' | 'pin'>(mode === 'lock' && lockUser ? 'pin' : 'pick')
  const [picked, setPicked]       = useState<StaffUser | null>(
    mode === 'lock' && lockUser ? { id: lockUser.id, name: lockUser.name, role: lockUser.role, color: lockUser.color } : null
  )
  const [pin, setPin]             = useState('')
  const [error, setError]         = useState(false)
  const [checking, setChecking]   = useState(false)

  // Only real staff saved in Settings → Users are ever shown or allowed to
  // log in here — no demo/sample fallback. Every PIN goes through the server
  // check below.
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.ok ? r.json() : null)
      .then(d => setUsers(Array.isArray(d?.users) ? d.users : []))
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false))
  }, [])

  useEffect(() => {
    if (pin.length !== 4 || !picked || checking) return
    setChecking(true)
    fetch('/api/users/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: picked.id, pin }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.valid) {
          onLogin({ id: d.user.id, name: d.user.name, role: d.user.role, color: d.user.color })
        } else {
          setError(true)
          setTimeout(() => { setError(false); setPin('') }, 800)
        }
      })
      .finally(() => setChecking(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']
  const isLock = mode === 'lock'
  const title = heading ?? (isLock ? '🔒 Screen Locked' : 'Switch User')
  const sub   = subtext ?? (isLock ? "Inactive too long — pick who's continuing" : null)

  return (
    // Full-screen, fully OPAQUE takeover — no dimmed peek-through of the POS
    // content behind it. This gates higher-privilege features (Analytics,
    // Settings, Users), so it needs the same weight/security feel as the real
    // /auth login page, not a small dismissible-looking modal.
    <div
      className="fixed inset-0 bg-[#FAF8F4] z-[100] flex items-center justify-center p-6"
      onPointerDown={isLock ? undefined : onClose}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden" onPointerDown={e => e.stopPropagation()}>
        {step === 'pick' ? (
          <>
            <div className="flex items-center justify-between px-8 py-6 border-b border-stone-100">
              <h2 className="text-2xl font-bold text-stone-900">{title}</h2>
              <div className="flex items-center gap-3">
                <button
                  onPointerDown={onLogout}
                  className="text-sm text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 px-3.5 py-1.5 rounded-lg transition"
                >
                  Logout
                </button>
                {!isLock && (
                  <button onPointerDown={onClose} className="text-stone-400 hover:text-stone-700 text-2xl leading-none">✕</button>
                )}
              </div>
            </div>
            {sub && (
              <p className="px-8 pt-4 text-sm text-stone-400">{sub}</p>
            )}
            {usersLoading ? (
              <div className="p-16 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-base font-medium text-stone-500">No staff accounts yet</p>
                <p className="text-sm text-stone-400 mt-1">Add staff in Settings → Users to enable switching</p>
              </div>
            ) : (
              <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
                {users.map(u => (
                  <button
                    key={u.id}
                    onPointerDown={() => { setPicked(u); setPin(''); setError(false); setStep('pin') }}
                    className="flex flex-col items-center gap-2.5 p-5 bg-stone-50 hover:bg-stone-100 border border-stone-100 hover:border-stone-300 rounded-2xl transition-all active:scale-95"
                  >
                    <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-sm" style={{ background: u.color }}>
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-center">
                      <p className="text-base font-semibold text-stone-900">{u.name}</p>
                      <p className="text-xs text-stone-400">{ROLE_LABELS[u.role] ?? u.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-8 py-6 border-b border-stone-100">
              <button onPointerDown={() => { setStep('pick'); setPin('') }} className="text-stone-400 hover:text-stone-700 text-base">← Back</button>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-base font-bold text-white" style={{ background: picked?.color }}>
                  {picked?.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-base font-semibold text-stone-900">{picked?.name}</span>
              </div>
              {isLock ? (
                <button onPointerDown={onLogout} className="text-sm text-red-400 hover:text-red-600">Logout</button>
              ) : (
                <button onPointerDown={onClose} className="text-stone-400 hover:text-stone-700 text-2xl leading-none">✕</button>
              )}
            </div>
            <div className="px-8 pb-10 pt-4">
              <p className="text-sm text-stone-400 text-center mb-1">
                {isLock ? '🔒 Enter PIN to unlock' : 'Enter 4-digit PIN'}
              </p>
              <PinDots count={pin.length} error={error} />
              <div className="grid grid-cols-3 gap-4 mt-3 max-w-md mx-auto">
                {KEYS.map((k, i) => (
                  <button
                    key={i}
                    onPointerDown={() => {
                      if (k === '⌫') { setPin(p => p.slice(0, -1)); setError(false) }
                      else if (k && pin.length < 4) setPin(p => p + k)
                    }}
                    disabled={checking}
                    className={`aspect-square rounded-2xl text-3xl font-semibold transition-all active:scale-95 disabled:opacity-50 ${
                      k === '' ? 'invisible' :
                      k === '⌫' ? 'bg-stone-100 text-stone-500 hover:bg-stone-200' :
                      'bg-stone-50 text-stone-900 border border-stone-200 hover:bg-stone-100 hover:border-stone-400'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              {error && <p className="text-sm text-red-500 text-center mt-4 animate-pulse">Incorrect PIN</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
