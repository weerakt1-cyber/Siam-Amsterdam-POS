'use client'

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { getOwnerProfile, setOwnerProfile, clearOwnerProfile, type GoogleProfile } from '@/lib/google-auth'

// ─── Google Identity Services types ───────────────────────────────────────────

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize:   (cfg: GsiInitConfig) => void
          renderButton: (el: HTMLElement, cfg: GsiButtonConfig) => void
          disableAutoSelect: () => void
        }
      }
    }
  }
}

type GsiInitConfig = {
  client_id:             string
  callback:              (r: { credential: string }) => void
  auto_select?:          boolean
  cancel_on_tap_outside?: boolean
}
type GsiButtonConfig = {
  type:   'standard' | 'icon'
  theme:  'outline' | 'filled_blue' | 'filled_black'
  size:   'large' | 'medium' | 'small'
  text?:  string
  width?: number
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  locale?: string
}

// ─── Google Sign-In Screen ─────────────────────────────────────────────────────

function GoogleLoginScreen({
  btnRef,
  loading,
  error,
}: {
  btnRef: React.RefObject<HTMLDivElement | null>
  loading: boolean
  error: string
}) {
  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-gray-950">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-4xl shadow-2xl">
            🍹
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black text-white tracking-tight">BAZE POS</h1>
            <p className="text-sm text-gray-500 mt-1">Bar POS System</p>
          </div>
        </div>

        {/* Card */}
        <div className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col items-center gap-5 shadow-2xl">
          <div className="text-center">
            <p className="text-white font-semibold text-lg">ยืนยันตัวตน</p>
            <p className="text-gray-400 text-sm mt-1">ลงชื่อเข้าด้วย Google เพื่อเริ่มใช้งาน</p>
          </div>

          {/* Google button placeholder — GIS injects here */}
          <div ref={btnRef} className="min-h-[44px] flex items-center justify-center w-full">
            {loading && (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
                กำลังโหลด…
              </div>
            )}
          </div>

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}
        </div>

        <p className="text-xs text-gray-600 text-center">
          ทำครั้งเดียวต่อเครื่อง · ข้อมูลไม่ถูกแชร์กับบุคคลอื่น
        </p>
      </div>
    </div>
  )
}

// ─── Profile Badge (shown in settings area) ───────────────────────────────────

export function OwnerProfileBadge() {
  const [profile, setProfile] = useState<GoogleProfile | null>(null)
  useEffect(() => { setProfile(getOwnerProfile()) }, [])

  if (!profile) return null

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
      {profile.picture && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.picture} alt="" className="w-9 h-9 rounded-full" referrerPolicy="no-referrer" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{profile.name}</p>
        <p className="text-xs text-gray-500 truncate">{profile.email}</p>
      </div>
      <button
        onClick={() => { clearOwnerProfile(); window.location.reload() }}
        className="text-xs text-red-500 hover:text-red-700 transition font-medium"
      >
        ออก
      </button>
    </div>
  )
}

// ─── Main Guard ───────────────────────────────────────────────────────────────

type State = 'checking' | 'authenticated' | 'unauthenticated'

export default function GoogleAuthGuard({ children }: { children: React.ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const [state,   setState] = useState<State>('checking')
  const [btnReady, setBtnReady] = useState(false)
  const [error,   setError]   = useState('')
  const btnRef = useRef<HTMLDivElement>(null)

  // Fast check: read localStorage before first paint (no flash)
  useLayoutEffect(() => {
    if (!clientId) { setState('authenticated'); return }  // feature disabled → pass through
    setState(getOwnerProfile() ? 'authenticated' : 'unauthenticated')
  }, [clientId])

  // Load Google Identity Services script when unauthenticated
  useEffect(() => {
    if (state !== 'unauthenticated' || !clientId) return

    const existing = document.querySelector('script[src*="accounts.google.com/gsi"]')
    if (existing) {
      initGsi()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = initGsi
    script.onerror = () => setError('โหลด Google Sign-In ล้มเหลว ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต')
    document.head.appendChild(script)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // Render Google button once btnRef is mounted and GIS is ready
  useEffect(() => {
    if (state !== 'unauthenticated' || !btnRef.current || !window.google || !clientId) return
    window.google.accounts.id.initialize({
      client_id:             clientId,
      callback:              handleCredential,
      auto_select:           false,
      cancel_on_tap_outside: false,
    })
    window.google.accounts.id.renderButton(btnRef.current, {
      type:   'standard',
      theme:  'filled_black',
      size:   'large',
      text:   'continue_with',
      width:  280,
      shape:  'pill',
      locale: 'th',
    })
    setBtnReady(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, clientId])

  function initGsi() {
    // Small delay to ensure window.google is available
    setTimeout(() => {
      if (!clientId || !btnRef.current || !window.google) return
      window.google.accounts.id.initialize({
        client_id:             clientId,
        callback:              handleCredential,
        auto_select:           false,
        cancel_on_tap_outside: false,
      })
      window.google.accounts.id.renderButton(btnRef.current!, {
        type:   'standard',
        theme:  'filled_black',
        size:   'large',
        text:   'continue_with',
        width:  280,
        shape:  'pill',
        locale: 'th',
      })
      setBtnReady(true)
    }, 100)
  }

  async function handleCredential(resp: { credential: string }) {
    setError('')
    try {
      const r = await fetch('/api/auth/google/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: resp.credential }),
      })
      const data = await r.json()
      if (data.profile) {
        setOwnerProfile(data.profile)
        setState('authenticated')
      } else {
        setError('ไม่สามารถยืนยันตัวตนได้ กรุณาลองใหม่')
      }
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  if (state === 'checking') return null  // ไม่มี flash
  if (state === 'unauthenticated') {
    return <GoogleLoginScreen btnRef={btnRef} loading={!btnReady} error={error} />
  }
  return <>{children}</>
}
