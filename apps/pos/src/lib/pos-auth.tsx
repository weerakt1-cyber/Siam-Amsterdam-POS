'use client'

import { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { loadBarSettings } from './printer'

// useLayoutEffect ป้องกัน PIN-screen flash บน client; ใช้ useEffect บน SSR
const useSyncEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const STORAGE_KEY       = 'pos_active_user'
const LAST_ACTIVITY_KEY = 'pos_last_activity'
const CHECK_INTERVAL_MS = 15000 // how often to check for inactivity while the tab is visible

export type ActiveUser = {
  id:    string
  name:  string
  role:  string
  color: string
}

type PosAuthContextType = {
  user:    ActiveUser | null
  loading: boolean
  locked:  boolean
  login:   (u: ActiveUser) => void
  logout:  () => void
  unlock:  () => void
}

const PosAuthContext = createContext<PosAuthContextType>({
  user: null, loading: true, locked: false, login: () => {}, logout: () => {}, unlock: () => {},
})

export function PosAuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<ActiveUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [locked,  setLocked]  = useState(false)
  const lastActivityRef = useRef(0)

  // อ่าน sessionStorage ก่อน paint — ไม่มี skeleton flash
  // sessionStorage ถูกล้างโดยอัตโนมัติเมื่อปิด tab / ปิด browser / ปัดแอปทิ้ง
  useSyncEffect(() => {
    try {
      const s = sessionStorage.getItem(STORAGE_KEY)
      if (s) setUser(JSON.parse(s))
      const last = sessionStorage.getItem(LAST_ACTIVITY_KEY)
      lastActivityRef.current = last ? Number(last) : Date.now()
    } catch {
      lastActivityRef.current = Date.now()
    }
    setLoading(false)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setLocked(false)
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  const bumpActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    try { sessionStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityRef.current)) } catch { /* ignore */ }
  }, [])

  const unlock = useCallback(() => {
    setLocked(false)
    bumpActivity()
  }, [bumpActivity])

  // แทนที่ auto-logout ตอน background ทันที — เปลี่ยนเป็น "ล็อกหน้าจอ" (ต้องใส่ PIN ใหม่)
  // หลังไม่มีการใช้งานเกินเวลาที่ตั้งไว้ (Settings → Display Time Lock) แทน เพื่อไม่ให้ต้องใส่
  // PIN ซ้ำทุกครั้งที่แท็บถูก background แค่ชั่วครู่ (สลับแอป, จอดับสั้นๆ ฯลฯ)
  useEffect(() => {
    if (!user) return

    const activityEvents: (keyof DocumentEventMap)[] = ['pointerdown', 'keydown', 'touchstart']
    activityEvents.forEach(ev => document.addEventListener(ev, bumpActivity))

    const checkInactivity = () => {
      const minutes = loadBarSettings().autoLockMinutes ?? 10
      if (!minutes) return // 0 = disabled
      if (Date.now() - lastActivityRef.current >= minutes * 60000) {
        setLocked(true)
      }
    }

    const iv = setInterval(checkInactivity, CHECK_INTERVAL_MS)
    const onVisibility = () => { if (!document.hidden) checkInactivity() }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      activityEvents.forEach(ev => document.removeEventListener(ev, bumpActivity))
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [user, bumpActivity])

  function login(u: ActiveUser) {
    setUser(u)
    setLocked(false)
    bumpActivity()
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(u)) } catch { /* ignore */ }
  }

  return (
    <PosAuthContext.Provider value={{ user, loading, locked, login, logout, unlock }}>
      {children}
    </PosAuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(PosAuthContext)
}
