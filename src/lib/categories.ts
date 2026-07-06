// Shared menu-category list — single source of truth for both the Items → Categories
// manager (add/delete/reorder) and the POS ordering screen's category filter chips.
// Persisted in localStorage so both pages (and a full-page navigation between them)
// always see the same order/set without needing a server round-trip.

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
