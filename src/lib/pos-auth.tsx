'use client'

import { createContext, useContext, useState, useEffect, useLayoutEffect } from 'react'

// useLayoutEffect runs before paint (ไม่มี flash) แต่ต้องป้องกัน SSR warning
const useSyncEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

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

  // อ่าน localStorage ก่อน paint ทันที — ไม่มี skeleton flash
  useSyncEffect(() => {
    try {
      const s = localStorage.getItem('pos_active_user')
      if (s) setUser(JSON.parse(s))
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  function login(u: ActiveUser) {
    setUser(u)
    try { localStorage.setItem('pos_active_user', JSON.stringify(u)) } catch { /* ignore */ }
  }

  function logout() {
    setUser(null)
    try { localStorage.removeItem('pos_active_user') } catch { /* ignore */ }
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
