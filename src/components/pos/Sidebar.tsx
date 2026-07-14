'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useAuth, type ActiveUser } from '@/lib/pos-auth'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import UserSwitcher from './UserSwitcher'

const MANAGER_ROLES = new Set(['admin', 'manager'])

const NAV = [
  { href: '/pos',            icon: '🛍️',  label: 'POS'       },
  { href: '/pos/floor',      icon: '🗺️',  label: 'Floor'     },
  { href: '/pos/kitchen',    icon: '🍳',  label: 'Kitchen'   },
  { href: '/pos/inventory',  icon: '📦',  label: 'Inventory' },
  { href: '/pos/items',      icon: '🍽️',  label: 'Items'     },
  { href: '/pos/members',    icon: '👥',  label: 'Members'   },
  { href: '/pos/cash',       icon: '💰',  label: 'Cash'      },
  { href: '/pos/coupons',    icon: '🎟️',  label: 'Coupons'   },
  { href: '/pos/analytics',  icon: '📊',  label: 'Analytics', managerOnly: true },
  { href: '/pos/users',      icon: '👤',  label: 'Users',     managerOnly: true },
  { href: '/pos/settings',   icon: '⚙️',  label: 'Settings',  managerOnly: true },
]

const BOTTOM_NAV = [
  { href: '/pos',           icon: '🛍️', label: 'POS'      },
  { href: '/pos/members',   icon: '👥', label: 'Members'  },
  { href: '/pos/cash',      icon: '💰', label: 'Cash'     },
  { href: '/pos/analytics', icon: '📊', label: 'Stats',    managerOnly: true },
  { href: '/pos/settings',  icon: '⚙️', label: 'Settings', managerOnly: true },
]

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const { user: activeUser, login, logout } = useAuth()
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [logoSrc, setLogoSrc] = useState('/logo.png')
  const [expanded, setExpanded] = useState(false)

  // Auto-collapse the expanded drawer whenever the route changes (i.e. after picking a page).
  useEffect(() => {
    setExpanded(false)
  }, [path])

  useEffect(() => {
    function refreshLogo() {
      try {
        const raw = localStorage.getItem('pos_bar_settings')
        if (raw) {
          const s = JSON.parse(raw)
          setLogoSrc(s.logoDataUrl || '/logo.png')
        }
      } catch { /* ignore */ }
    }
    refreshLogo()
    window.addEventListener('pos-settings-changed', refreshLogo)
    return () => window.removeEventListener('pos-settings-changed', refreshLogo)
  }, [])

  const handleLogin = (u: ActiveUser) => {
    login(u)
    setShowSwitcher(false)
  }

  const handleLogout = async () => {
    setShowSwitcher(false)
    logout()
    await getSupabaseBrowser().auth.signOut()
    router.replace('/auth')
  }

  function isActive(href: string) {
    return href === '/pos' ? path === '/pos' : path === href || path.startsWith(href + '/')
  }

  return (
    <>
      {/* ── Desktop collapsed rail (sm+): logo + hamburger only, menu hidden until tapped ── */}
      <nav className="hidden sm:flex w-14 bg-stone-900 border-r border-stone-800 flex-col items-center py-3 gap-2 shrink-0">
        <div className="mb-1">
          <div className="w-10 h-10 rounded-2xl overflow-hidden border border-stone-700 shrink-0">
            <img src={logoSrc} alt="Bar logo" className="w-full h-full object-cover" />
          </div>
        </div>

        <button
          onClick={() => setExpanded(true)}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl text-stone-300 hover:text-stone-100 hover:bg-stone-800 transition-all active:scale-95"
          title="Menu"
        >
          ☰
        </button>

        <div className="flex-1" />

        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg bg-amber-500/10 text-amber-400">
          {NAV.find(item => isActive(item.href))?.icon ?? '•'}
        </div>

        <button
          onPointerDown={() => setShowSwitcher(true)}
          className="w-11 h-11 rounded-xl flex items-center justify-center transition-all hover:bg-stone-800 active:scale-95 mb-1"
          title={activeUser ? `${activeUser.name} — switch user` : 'Login'}
        >
          {activeUser ? (
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm" style={{ background: activeUser.color }}>
              {activeUser.name.charAt(0).toUpperCase()}
            </div>
          ) : (
            <span className="text-lg text-stone-600">🔓</span>
          )}
        </button>
      </nav>

      {/* ── Expanded nav drawer (sm+): slides out wider, shows full labeled menu, like Loyverse ── */}
      <div
        className={`hidden sm:block fixed inset-0 z-40 transition-opacity duration-200 ${
          expanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="absolute inset-0 bg-black/40" onClick={() => setExpanded(false)} />
        <nav
          className={`absolute inset-y-0 left-0 w-64 bg-stone-900 border-r border-stone-800 flex flex-col py-3 px-2.5 gap-1 shadow-2xl transition-transform duration-200 ${
            expanded ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center gap-2.5 px-1.5 mb-2">
            <div className="w-10 h-10 rounded-2xl overflow-hidden border border-stone-700 shrink-0">
              <img src={logoSrc} alt="Bar logo" className="w-full h-full object-cover" />
            </div>
            <span className="text-stone-200 font-bold text-sm flex-1">Menu</span>
            <button
              onClick={() => setExpanded(false)}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-all active:scale-95 text-lg"
              title="Close"
            >
              ✕
            </button>
          </div>
          <div className="border-t border-stone-800 mb-1" />

          {NAV.filter(item => !item.managerOnly || MANAGER_ROLES.has(activeUser?.role ?? '')).map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 h-12 px-3 rounded-xl transition-all active:scale-[0.98] ${
                  active
                    ? 'bg-amber-500 text-stone-900 shadow-sm'
                    : 'text-stone-400 hover:text-stone-100 hover:bg-stone-800'
                }`}
              >
                <span className="text-xl leading-none">{item.icon}</span>
                <span className="font-bold text-sm leading-none">{item.label}</span>
              </Link>
            )
          })}

          <div className="flex-1" />
          <div className="border-t border-stone-800 mb-1" />

          <button
            onClick={() => { setShowSwitcher(true); setExpanded(false) }}
            className="flex items-center gap-3 h-12 px-3 rounded-xl transition-all hover:bg-stone-800 active:scale-[0.98]"
          >
            {activeUser ? (
              <>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm shrink-0" style={{ background: activeUser.color }}>
                  {activeUser.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-stone-300 font-bold text-sm truncate">{activeUser.name} — switch user</span>
              </>
            ) : (
              <>
                <span className="text-xl leading-none text-stone-600">🔓</span>
                <span className="text-stone-400 font-bold text-sm">Login</span>
              </>
            )}
          </button>
          <span className="text-[10px] text-stone-700 font-mono text-center mt-1">v1.0</span>
        </nav>
      </div>

      {/* ── Mobile bottom nav (hidden on sm+) ── */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-stone-200 flex items-stretch"
        style={{ boxShadow: '0 -2px 12px rgba(0,0,0,0.08)' }}
      >
        {BOTTOM_NAV.filter(item => !item.managerOnly || MANAGER_ROLES.has(activeUser?.role ?? '')).map((item) => {
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
