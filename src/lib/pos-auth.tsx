'use client'

import { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback } from 'react'

// useLayoutEffect ป้องกัน PIN-screen flash บน client; ใช้ useEffect บน SSR
const useSyncEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const STORAGE_KEY = 'pos_active_user'

export type ActiveUser = {
  id:    string
  name:  string
  role:  string
  color: string
}

type PosAuthContextType = {
  user:    ActiveUser | null
  loading: boolean
  login:   (u: ActiveUser) => void
  logout:  () => void
}

const PosAuthContext = createContext<PosAuthContextType>({
  user: null, loading: true, login: () => {}, logout: () => {},
})

export function PosAuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<ActiveUser | null>(null)
  const [loading, setLoading] = useState(true)

  // อ่าน sessionStorage ก่อน paint — ไม่มี skeleton flash
  // sessionStorage ถูกล้างโดยอัตโนมัติเมื่อปิด tab / ปิด browser / ปัดแอปทิ้ง
  useSyncEffect(() => {
    try {
      const s = sessionStorage.getItem(STORAGE_KEY)
      if (s) setUser(JSON.parse(s))
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  // Auto-logout เมื่อ app ถูก background (ปัดออก / switch แอป / หน้าจอดับ)
  // visibilitychange ทำงานได้ทั้งใน browser และ Capacitor WebView (Android/iOS)
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) logout()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [logout])

  function login(u: ActiveUser) {
    setUser(u)
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(u)) } catch { /* ignore */ }
  }

  return (
    <PosAuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </PosAuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(PosAuthContext)
}
