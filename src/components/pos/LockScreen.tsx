'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/pos-auth'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import UserSwitcher from './UserSwitcher'

// Renders the mandatory PIN re-entry screen after Settings → Display Time Lock
// minutes of inactivity elapse. No dismiss — only a valid PIN or full Logout gets past it.
export default function LockScreen() {
  const router = useRouter()
  const { user, locked, login, logout } = useAuth()

  if (!locked) return null

  async function handleLogout() {
    logout()
    await getSupabaseBrowser().auth.signOut()
    router.replace('/auth')
  }

  return (
    <UserSwitcher
      mode="lock"
      lockUser={user}
      onLogin={login}
      onLogout={handleLogout}
    />
  )
}
