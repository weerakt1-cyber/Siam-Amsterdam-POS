// Shared menu-category list — single source of truth for the Items → Categories
// manager (add/delete/reorder), the POS ordering screen's category chips, and the
// customer-facing QR ordering page.
//
// Canonical data lives in Supabase (fetchCategories/persistCategories below) since
// the QR ordering page runs on a customer's own phone — a different device than
// the staff POS tablet, so it can never read that device's localStorage. The
// localStorage helpers (loadAllCategories/saveAllCategories) are kept only as an
// instant-first-paint cache: render last-known data immediately, then
// fetchCategories() resolves with the authoritative list.

export type CatEntry = { value: string; label: string; color: string; icon?: string }

export const DEFAULT_CATEGORIES: CatEntry[] = [
  { value: 'cocktail', label: 'Cocktail', color: 'bg-purple-600 text-gray-900', icon: '🍹' },
  { value: 'beer',     label: 'Beer',     color: 'bg-amber-600 text-gray-900',  icon: '🍺' },
  { value: 'drink',    label: 'Drink',    color: 'bg-cyan-600 text-gray-900',   icon: '🥤' },
  { value: 'snack',    label: 'Snack',    color: 'bg-lime-600 text-gray-900',   icon: '🍿' },
  { value: 'food',     label: 'Food',     color: 'bg-red-600 text-gray-900',    icon: '🍔' },
  { value: 'shot',     label: 'Shot',     color: 'bg-orange-600 text-gray-900', icon: '🥃' },
  { value: 'other',    label: 'Other',    color: 'bg-gray-300 text-gray-700',   icon: '🏷️' },
]

export const DEFAULT_CATEGORY_ICON = '🏷️'

const LS_LEGACY_CATS_KEY = 'pos_custom_categories' // legacy key — read once for migration
const LS_ALL_CATS_KEY    = 'pos_all_categories'    // full, ordered, fully-editable category list

// Fired on window whenever the category list changes, so any other mounted page
// (e.g. the POS ordering screen) can refresh live without a full navigation.
export const CATEGORIES_CHANGED_EVENT = 'pos-categories-changed'

export function loadAllCategories(): CatEntry[] {
  if (typeof window === 'undefined') return DEFAULT_CATEGORIES
  try {
    const saved = JSON.parse(localStorage.getItem(LS_ALL_CATS_KEY) ?? 'null')
    if (Array.isArray(saved) && saved.length > 0) return saved
  } catch { /* ignore */ }
  try {
    const legacyCustom = JSON.parse(localStorage.getItem(LS_LEGACY_CATS_KEY) ?? '[]')
    return [...DEFAULT_CATEGORIES, ...legacyCustom]
  } catch {
    return DEFAULT_CATEGORIES
  }
}

export function saveAllCategories(cats: CatEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_ALL_CATS_KEY, JSON.stringify(cats))
    window.dispatchEvent(new CustomEvent(CATEGORIES_CHANGED_EVENT))
  } catch { /* ignore */ }
}

// ─── Server-backed (authoritative) ─────────────────────────────────────────────

function hasCustomData(cats: CatEntry[]): boolean {
  return cats.some(c => !DEFAULT_CATEGORIES.some(d => d.value === c.value))
}

// Fetches the real, shared list from Supabase. Falls back gracefully:
// - Network/server error → whatever's cached on this device, or defaults.
// - Server has no rows yet AND this device's local cache has real custom data
//   (i.e. an existing install from before categories moved server-side) →
//   push that local data up once, so it becomes the new shared source of truth
//   instead of silently disappearing.
// - Otherwise (genuinely fresh install/device) → built-in defaults.
export async function fetchCategories(): Promise<CatEntry[]> {
  if (typeof window === 'undefined') return DEFAULT_CATEGORIES
  try {
    const res = await fetch('/api/categories')
    if (!res.ok) return loadAllCategories()
    const data = await res.json()
    const list: CatEntry[] = Array.isArray(data.categories) ? data.categories : []
    if (list.length > 0) {
      try { localStorage.setItem(LS_ALL_CATS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
      return list
    }
    const localCache = loadAllCategories()
    if (hasCustomData(localCache)) {
      await persistCategories(localCache)
      return localCache
    }
    return DEFAULT_CATEGORIES
  } catch {
    return loadAllCategories()
  }
}

// Persists the full ordered list to Supabase (source of truth for every device),
// and updates the local cache + fires the same-device live-refresh event.
export async function persistCategories(cats: CatEntry[]): Promise<void> {
  saveAllCategories(cats)
  try {
    await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: cats }),
    })
  } catch { /* local cache is already updated; next fetchCategories() elsewhere will retry */ }
}
