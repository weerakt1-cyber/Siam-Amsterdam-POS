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
  { href: '/pos/items',      icon: '🍹',  label: 'Items'     },
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
      {/* ── Desktop sidebar (sm+) ── */}
      <nav
        className="hidden sm:flex w-16 bg-stone-900 border-r border-stone-800 flex-col items-center py-3 gap-1 shrink-0"
      >
        <div className="mb-2 mt-1">
          <div className="w-11 h-11 rounded-2xl overflow-hidden border border-stone-700 shrink-0">
            <img src={logoSrc} alt="Siam Amsterdam" className="w-full h-full object-cover" />
          </div>
        </div>
        <div className="w-8 border-t border-stone-700 mb-1" />

        {NAV.filter(item => !item.managerOnly || MANAGER_ROLES.has(activeUser?.role ?? '')).map((item) => {
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
