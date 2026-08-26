'use client'

import { useEffect } from 'react'
import { isNativePlatform } from '@/lib/printer'

// Registers the PWA service worker (public/sw.js) so the app is installable
// and has a light offline shell. Skipped inside the Capacitor native shell,
// which is already an installed app and manages its own web layer.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (isNativePlatform()) return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* registration failure is non-fatal — the app still works online */
    })
  }, [])

  return null
}
