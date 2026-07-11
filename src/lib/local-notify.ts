// Native Android notifications (notification shade) for business alerts —
// dynamically imported like the other Capacitor plugins in this codebase, to
// avoid touching window.Capacitor during SSR. No-op on web / before the user
// grants the notification permission (Android 13+ requires POST_NOTIFICATIONS
// at runtime; the plugin declares it in its own manifest, merged automatically).

import { isNativePlatform } from './printer'

// LocalNotifications needs a numeric id, but alert ids are strings like
// "stock-low-<itemId>" — hash to a stable positive 31-bit int.
function hashId(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h) || 1
}

let permissionAsked = false

export async function requestNotifyPermission(): Promise<boolean> {
  if (!isNativePlatform() || permissionAsked) return false
  permissionAsked = true
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const cur = await LocalNotifications.checkPermissions()
    if (cur.display === 'granted') return true
    const res = await LocalNotifications.requestPermissions()
    return res.display === 'granted'
  } catch {
    return false
  }
}

export async function fireLocalNotification(alertId: string, title: string, body: string): Promise<void> {
  if (!isNativePlatform()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.schedule({
      notifications: [{ id: hashId(alertId), title, body }],
    })
  } catch {
    // Permission not granted, or plugin unavailable — the in-app bell still
    // shows the alert, so this is safe to swallow.
  }
}
