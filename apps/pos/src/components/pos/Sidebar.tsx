'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useAuth, type ActiveUser } from '@/lib/pos-auth'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import UserSwitcher from './UserSwitcher'
import { usePosLang, type PosStringKey } from '@/lib/pos-i18n'

const MANAGER_ROLES = new Set(['admin', 'manager'])

const NAV: { href: string; icon: string; labelKey: PosStringKey; managerOnly?: boolean; adminOnly?: boolean; superAdminOnly?: boolean }[] = [
  { href: '/pos',            icon: '/nav-icons/pos.png',       labelKey: 'navPos'       },
  { href: '/pos/floor',      icon: '/nav-icons/floor.png',     labelKey: 'navFloor'     },
  { href: '/pos/reservations', icon: '/nav-icons/members.png', labelKey: 'navReservations' },
  { href: '/pos/kitchen',    icon: '/nav-icons/kitchen.png',   labelKey: 'navKitchen'   },
  { href: '/pos/inventory',  icon: '/nav-icons/inventory.png', labelKey: 'navInventory' },
  { href: '/pos/items',      icon: '/nav-icons/items.png',     labelKey: 'navItems'     },
  { href: '/pos/members',    icon: '/nav-icons/members.png',   labelKey: 'navMembers'   },
  { href: '/pos/cash',       icon: '/nav-icons/cash.png',      labelKey: 'navCash'      },
  { href: '/pos/coupons',    icon: '/nav-icons/coupons.png',   labelKey: 'navCoupons'   },
  { href: '/pos/analytics',  icon: '/nav-icons/analytics.png', labelKey: 'navAnalytics', managerOnly: true },
  { href: '/pos/users',      icon: '/nav-icons/users.png',     labelKey: 'navUsers',     managerOnly: true },
  { href: '/pos/settings',   icon: '/nav-icons/settings.png',  labelKey: 'navSettings',  managerOnly: true },
  { href: '/super-admin',    icon: '/nav-icons/users.png',     labelKey: 'navSuperAdmin', superAdminOnly: true },
]

const BOTTOM_NAV: { href: string; icon: string; labelKey: PosStringKey; managerOnly?: boolean }[] = [
  { href: '/pos',           icon: '/nav-icons/pos.png',       labelKey: 'navPos'      },
  { href: '/pos/members',   icon: '/nav-icons/members.png',   labelKey: 'navMembers'  },
  { href: '/pos/cash',      icon: '/nav-icons/cash.png',      labelKey: 'navCash'     },
  { href: '/pos/analytics', icon: '/nav-icons/analytics.png', labelKey: 'navStats',    managerOnly: true },
  { href: '/pos/settings',  icon: '/nav-icons/settings.png',  labelKey: 'navSettings', managerOnly: true },
]

// The pack icons are monochrome PNGs. We tint them via a CSS mask (a colour-filled
// box clipped to the icon shape) so every icon matches the POS item-price yellow.
// On the amber active pill the yellow would vanish, so active items use stone-900.
const ICON_AMBER    = '#f59e0b'   // item-price yellow — default icon colour
const ICON_ON_AMBER = '#1c1917'   // stone-900, for icons sitting on the amber active pill

function NavIcon({ src, color, className = '' }: { src: string; color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
      style={{
        backgroundColor: color,
        WebkitMaskImage: `url("${src}")`,
        maskImage: `url("${src}")`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  )
}

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const { user: activeUser, login, logout } = useAuth()
  const { t } = usePosLang()
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [logoSrc, setLogoSrc] = useState('/logo.png')
  const [expanded, setExpanded] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  // Only the platform operator sees the Super-admin link. The allow-list is
  // exposed to the client via NEXT_PUBLIC_SUPER_ADMIN_EMAILS (the API still
  // enforces the real check server-side); unset → nobody sees the link.
  useEffect(() => {
    const allow = (process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS ?? '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    if (!allow.length) return
    getSupabaseBrowser().auth.getUser().then(({ data }) => {
      const email = data.user?.email?.toLowerCase() ?? ''
      if (email && allow.includes(email)) setIsSuperAdmin(true)
    }).catch(() => {})
  }, [])

  // Sidebar visibility (UI only — every route is still guarded server-side).
  const role = activeUser?.role ?? ''
  const visible = (item: { managerOnly?: boolean; adminOnly?: boolean; superAdminOnly?: boolean }) => {
    if (item.superAdminOnly) return isSuperAdmin
    if (item.adminOnly)      return role === 'admin'
    if (item.managerOnly)    return MANAGER_ROLES.has(role)
    return true
  }

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

        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500/10">
          {(() => {
            const activeItem = NAV.find(item => isActive(item.href))
            return activeItem ? (
              <NavIcon src={activeItem.icon} color={ICON_AMBER} className="w-5 h-5" />
            ) : (
              <span className="text-lg text-amber-400">•</span>
            )
          })()}
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
            <span className="text-stone-200 font-bold text-sm flex-1">{t('menu')}</span>
            <button
              onClick={() => setExpanded(false)}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-all active:scale-95 text-lg"
              title="Close"
            >
              ✕
            </button>
          </div>
          <div className="border-t border-stone-800 mb-1" />

          {NAV.filter(visible).map((item) => {
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
                <NavIcon src={item.icon} color={active ? ICON_ON_AMBER : ICON_AMBER} className="w-6 h-6" />
                <span className="font-bold text-sm leading-none">{t(item.labelKey)}</span>
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
                <span className="text-stone-300 font-bold text-sm truncate">{activeUser.name} — {t('switchUser')}</span>
              </>
            ) : (
              <>
                <span className="text-xl leading-none text-stone-600">🔓</span>
                <span className="text-stone-400 font-bold text-sm">{t('login')}</span>
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
        {BOTTOM_NAV.filter(visible).map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all active:scale-95 relative ${
                active ? 'text-stone-900' : 'text-stone-400'
              }`}
            >
              {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-amber-500 rounded-full" />}
              <NavIcon src={item.icon} color={ICON_AMBER} className={`w-[22px] h-[22px] ${active ? '' : 'opacity-45'}`} />
              {/* label colour follows active state below */}
              <span className={`text-[9px] font-semibold leading-none mt-0.5 ${active ? 'text-stone-900' : 'text-stone-400'}`}>
                {t(item.labelKey)}
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
              <span className="text-[9px] text-stone-400 font-semibold leading-none mt-0.5">{t('login')}</span>
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
