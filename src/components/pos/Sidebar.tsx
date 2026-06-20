'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useAuth, type ActiveUser } from '@/lib/pos-auth'
import { DEMO_USERS, isDemoUser } from '@/lib/demo-data'

const NAV = [
  { href: '/pos',            icon: '🛍️',  label: 'POS'       },
  { href: '/pos/kitchen',    icon: '🍳',  label: 'Kitchen'   },
  { href: '/pos/inventory',  icon: '📦',  label: 'Inventory' },
  { href: '/pos/items',      icon: '🍹',  label: 'Items'     },
  { href: '/pos/members',    icon: '👥',  label: 'Members'   },
  { href: '/pos/cash',       icon: '💰',  label: 'Cash'      },
  { href: '/pos/coupons',    icon: '🎟️',  label: 'Coupons'   },
  { href: '/pos/analytics',  icon: '📊',  label: 'Analytics' },
  { href: '/pos/users',      icon: '👤',  label: 'Users'     },
  { href: '/pos/settings',   icon: '⚙️',  label: 'Settings'  },
]

const BOTTOM_NAV = [
  { href: '/pos',           icon: '🛍️', label: 'POS'      },
  { href: '/pos/members',   icon: '👥', label: 'Members'  },
  { href: '/pos/cash',      icon: '💰', label: 'Cash'     },
  { href: '/pos/analytics', icon: '📊', label: 'Stats'    },
  { href: '/pos/settings',  icon: '⚙️', label: 'Settings' },
]

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

function UserSwitcher({ onLogin, onLogout, onClose }: { onLogin: (u: ActiveUser) => void; onLogout: () => void; onClose: () => void }) {
  const [users, setUsers]         = useState<StaffUser[]>(DEMO_USERS)
  const [step, setStep]           = useState<'pick' | 'pin'>('pick')
  const [picked, setPicked]       = useState<StaffUser | null>(null)
  const [pin, setPin]             = useState('')
  const [error, setError]         = useState(false)
  const [checking, setChecking]   = useState(false)

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.users?.length) setUsers(d.users) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (pin.length !== 4 || !picked || checking) return
    if (isDemoUser(picked.id)) {
      onLogin({ id: picked.id, name: picked.name, role: picked.role, color: picked.color })
      return
    }
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

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onPointerDown={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onPointerDown={e => e.stopPropagation()}>
        {step === 'pick' ? (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h2 className="text-base font-bold text-stone-900">Switch User</h2>
              <div className="flex items-center gap-2">
                <button
                  onPointerDown={onLogout}
                  className="text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 px-2.5 py-1 rounded-lg transition"
                >
                  Logout
                </button>
                <button onPointerDown={onClose} className="text-stone-400 hover:text-stone-700 text-xl leading-none">✕</button>
              </div>
            </div>
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
              <button onPointerDown={onClose} className="text-stone-400 hover:text-stone-700 text-xl leading-none">✕</button>
            </div>
            <div className="px-6 pb-6 pt-2">
              <p className="text-xs text-stone-400 text-center mb-1">Enter 4-digit PIN</p>
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

export default function Sidebar() {
  const path = usePathname()
  const { user: activeUser, login, logout } = useAuth()
  const [showSwitcher, setShowSwitcher] = useState(false)

  const handleLogin = (u: ActiveUser) => {
    login(u)
    setShowSwitcher(false)
  }

  const handleLogout = () => {
    logout()
    setShowSwitcher(false)
  }

  function isActive(href: string) {
    return href === '/pos' ? path === '/pos' : path === href || path.startsWith(href + '/')
  }

  return (
    <>
      {/* ── Desktop sidebar (sm+) ── */}
      <nav
        className="hidden sm:flex w-16 bg-stone-900 border-r border-stone-800 flex-col items-center py-3 gap-1 shrink-0"
      >
        <div className="mb-2 mt-1"><span className="text-2xl">🍹</span></div>
        <div className="w-8 border-t border-stone-700 mb-1" />

        {NAV.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
                active
                  ? 'bg-amber-500 text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-100 hover:bg-stone-800'
              }`}
            >
              <span className="text-[18px] leading-none">{item.icon}</span>
              <span className={`text-[8px] font-bold leading-none mt-0.5 ${active ? 'text-stone-900' : 'text-inherit'}`}>
                {item.label.toUpperCase()}
              </span>
            </Link>
          )
        })}

        <div className="flex-1" />
        <div className="w-8 border-t border-stone-700 mb-1" />

        <button
          onPointerDown={() => setShowSwitcher(true)}
          className="w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all hover:bg-stone-800 active:scale-95"
          title={activeUser ? `${activeUser.name} — switch user` : 'Login'}
        >
          {activeUser ? (
            <>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm" style={{ background: activeUser.color }}>
                {activeUser.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-[7px] text-stone-500 font-semibold leading-none truncate max-w-[44px] text-center">{activeUser.name}</span>
            </>
          ) : (
            <>
              <span className="text-[18px] leading-none text-stone-600">🔓</span>
              <span className="text-[7px] text-stone-600 font-bold leading-none">LOGIN</span>
            </>
          )}
        </button>
        <span className="text-[8px] text-stone-700 font-mono mb-1">v1.0</span>
      </nav>

      {/* ── Mobile bottom nav (hidden on sm+) ── */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-stone-200 flex items-stretch"
        style={{ boxShadow: '0 -2px 12px rgba(0,0,0,0.08)' }}
      >
        {BOTTOM_NAV.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all active:scale-95 relative ${
                active ? 'text-stone-900' : 'text-stone-400'
              }`}
            >
              {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-stone-900 rounded-full" />}
              <span className="text-[20px] leading-none">{item.icon}</span>
              <span className={`text-[9px] font-semibold leading-none mt-0.5 ${active ? 'text-stone-900' : 'text-stone-400'}`}>
                {item.label}
              </span>
            </Link>
          )
        })}

        {/* User button */}
        <button
          onPointerDown={() => setShowSwitcher(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all active:scale-95"
        >
          {activeUser ? (
            <>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: activeUser.color }}>
                {activeUser.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-[9px] text-stone-400 font-semibold leading-none truncate max-w-[40px] text-center">{activeUser.name}</span>
            </>
          ) : (
            <>
              <span className="text-[20px] leading-none text-stone-400">🔓</span>
              <span className="text-[9px] text-stone-400 font-semibold leading-none mt-0.5">Login</span>
            </>
          )}
        </button>
      </nav>

      {showSwitcher && (
        <UserSwitcher onLogin={handleLogin} onLogout={handleLogout} onClose={() => setShowSwitcher(false)} />
      )}
    </>
  )
}
