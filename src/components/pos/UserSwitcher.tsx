'use client'

import { useState, useEffect } from 'react'
import type { ActiveUser } from '@/lib/pos-auth'

type StaffUser = { id: string; name: string; role: string; color: string }

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', bartender: 'Bartender', staff: 'Staff',
}

function PinDots({ count, error }: { count: number; error?: boolean }) {
  return (
    <div className="flex justify-center gap-3 py-3">
      {Array(4).fill(0).map((_, i) => (
        <div
          key={i}
          className={`w-3.5 h-3.5 rounded-full transition-all duration-100 ${
            error     ? 'bg-red-500 scale-110' :
            i < count ? 'bg-amber-500 scale-110' : 'bg-stone-200'
          }`}
        />
      ))}
    </div>
  )
}

export default function UserSwitcher({
  onLogin, onLogout, onClose, mode = 'switch', lockUser,
}: {
  onLogin:  (u: ActiveUser) => void
  onLogout: () => void
  onClose?: () => void
  mode?:    'switch' | 'lock'  // 'lock' = mandatory PIN re-entry after inactivity, no dismiss
  lockUser?: ActiveUser | null // preselected user when opened as a lock screen
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

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4"
      onPointerDown={isLock ? undefined : onClose}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onPointerDown={e => e.stopPropagation()}>
        {step === 'pick' ? (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h2 className="text-base font-bold text-stone-900">{isLock ? '🔒 Screen Locked' : 'Switch User'}</h2>
              <div className="flex items-center gap-2">
                <button
                  onPointerDown={onLogout}
                  className="text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 px-2.5 py-1 rounded-lg transition"
                >
                  Logout
                </button>
                {!isLock && (
                  <button onPointerDown={onClose} className="text-stone-400 hover:text-stone-700 text-xl leading-none">✕</button>
                )}
              </div>
            </div>
            {isLock && (
              <p className="px-5 pt-3 text-xs text-stone-400">Inactive too long — pick who&apos;s continuing</p>
            )}
            {usersLoading ? (
              <div className="p-10 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm font-medium text-stone-500">No staff accounts yet</p>
                <p className="text-xs text-stone-400 mt-1">Add staff in Settings → Users to enable switching</p>
              </div>
            ) : (
              <div className="p-4 grid grid-cols-2 gap-3">
                {users.map(u => (
                  <button
                    key={u.id}
                    onPointerDown={() => { setPicked(u); setPin(''); setError(false); setStep('pin') }}
                    className="flex flex-col items-center gap-2 p-4 bg-stone-50 hover:bg-stone-100 border border-stone-100 hover:border-stone-300 rounded-xl transition-all active:scale-95"
                  >
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-sm" style={{ background: u.color }}>
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-stone-900">{u.name}</p>
                      <p className="text-[10px] text-stone-400">{ROLE_LABELS[u.role] ?? u.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <button onPointerDown={() => { setStep('pick'); setPin('') }} className="text-stone-400 hover:text-stone-700 text-sm">← Back</button>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: picked?.color }}>
                  {picked?.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-semibold text-stone-900">{picked?.name}</span>
              </div>
              {isLock ? (
                <button onPointerDown={onLogout} className="text-xs text-red-400 hover:text-red-600">Logout</button>
              ) : (
                <button onPointerDown={onClose} className="text-stone-400 hover:text-stone-700 text-xl leading-none">✕</button>
              )}
            </div>
            <div className="px-6 pb-6 pt-2">
              <p className="text-xs text-stone-400 text-center mb-1">
                {isLock ? '🔒 Enter PIN to unlock' : 'Enter 4-digit PIN'}
              </p>
              <PinDots count={pin.length} error={error} />
              <div className="grid grid-cols-3 gap-2 mt-3">
                {KEYS.map((k, i) => (
                  <button
                    key={i}
                    onPointerDown={() => {
                      if (k === '⌫') { setPin(p => p.slice(0, -1)); setError(false) }
                      else if (k && pin.length < 4) setPin(p => p + k)
                    }}
                    disabled={checking}
                    className={`h-12 rounded-xl text-lg font-semibold transition-all active:scale-95 disabled:opacity-50 ${
                      k === '' ? 'invisible' :
                      k === '⌫' ? 'bg-stone-100 text-stone-500 hover:bg-stone-200' :
                      'bg-stone-50 text-stone-900 border border-stone-200 hover:bg-stone-100 hover:border-stone-400'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              {error && <p className="text-xs text-red-500 text-center mt-3 animate-pulse">Incorrect PIN</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
