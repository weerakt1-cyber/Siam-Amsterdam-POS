'use client'

import { useEffect } from 'react'
import { hydrateSettingsFromServer } from '@/lib/settings-sync'

/**
 * SettingsSync — hydrate bar settings + floor layout from the server on startup.
 *
 * Separate client component because pos/layout.tsx is a server component
 * (it exports metadata). Renders nothing; on mount it pulls the server-saved
 * settings into localStorage and fires the change events so any open screen
 * refreshes. This is what restores shop name / tables / Google review after a
 * reinstall or on a brand-new device.
 */
export default function SettingsSync() {
  useEffect(() => {
    hydrateSettingsFromServer()
  }, [])
  return null
}
