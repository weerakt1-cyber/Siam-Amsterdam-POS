'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/pos-auth'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import UserSwitcher from './UserSwitcher'

// Once the device is authenticated (AppAuthGuard) the POS operating identity
// must be a real staff (PIN) account — NOT the Google login profile. This gate
// forces picking a staff whenever there's no active POS user and the screen
// isn't locked, keeping the shown user on a single base (the staff table) so a
// Google account name (e.g. the owner's) never appears as the active user.
//
// Note: when no staff exist yet, AppAuthGuard bootstraps the authenticated admin
// as the active user so they can reach Settings → Users to create staff — in
// that case `user` is set and this gate stays hidden.
export default function StaffGate() {
  const router = useRouter()
  const { user, locked, login, logout } = useAuth()

  if (user || locked) return null

  async function handleLogout() {
    logout()
    await getSupabaseBrowser().auth.signOut()
    router.replace('/auth')
  }

  return (
    <UserSwitcher
      mode="lock"
      heading="👤 Select User"
      subtext="Tap your name to start your shift"
      onLogin={login}
      onLogout={handleLogout}
    />
  )
}
