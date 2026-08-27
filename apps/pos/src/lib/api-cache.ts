// Instant-first-paint cache for API list data.
//
// Page switches felt slow because every page re-fetched from the API on mount
// and showed a skeleton until it returned. These helpers let a page render its
// last-known data from localStorage immediately (so navigation is instant), then
// revalidate in the background and update. Data that changes often (orders) still
// refreshes within a poll; data that rarely changes (menu) is effectively free.

const PREFIX = 'ac_'

export function readCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeCache(key: string, data: unknown): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(data))
  } catch {
    /* storage full / disabled — the page just falls back to fetching */
  }
}

export function hasCache(key: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(PREFIX + key) != null
  } catch {
    return false
  }
}
