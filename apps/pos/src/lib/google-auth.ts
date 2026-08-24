export type GoogleProfile = {
  sub:     string
  email:   string
  name:    string
  picture: string
}

const KEY = 'pos_owner_google'

export function getOwnerProfile(): GoogleProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const s = localStorage.getItem(KEY)
    return s ? (JSON.parse(s) as GoogleProfile) : null
  } catch { return null }
}

export function setOwnerProfile(p: GoogleProfile): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

export function clearOwnerProfile(): void {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
