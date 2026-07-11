'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/pos-auth'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import UserSwitcher from './UserSwitcher'

// Renders the mandatory PIN re-entry screen after Settings → Display Time Lock
// minutes of inactivity elapse. No dismiss — only a valid PIN or full Logout gets past it.
export default function LockScreen() {
  const router = useRouter()
  const { locked, login, logout } = useAuth()

  if (!locked) return null

  async function handleLogout() {
    logout()
    await getSupabaseBrowser().auth.signOut()
    router.replace('/auth')
  }

  // Always show the real staff list to pick from — never pre-select a name — so
  // whoever resumes identifies themselves from the single staff base.
  return (
    <UserSwitcher
      mode="lock"
      onLogin={login}
      onLogout={handleLogout}
    />
  )
}
