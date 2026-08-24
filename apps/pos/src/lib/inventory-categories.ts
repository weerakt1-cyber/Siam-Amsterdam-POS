// User-managed stock categories for the Inventory page — the mirror of
// @/lib/categories.ts (menu categories), but a separate list so stock groups
// (Spirits, Mixers, Supplies…) never mix with menu groups (Cocktail, Beer…).
//
// Canonical data lives server-side in the app_config key/value table
// (/api/inventory-categories); localStorage is only an instant-first-paint
// cache. Add/delete happens client-side on the whole array, then persists in
// one shot — same shape as the menu-category manager.

export type InvCat = { value: string; label: string }

export const DEFAULT_INV_CATEGORIES: InvCat[] = [
  { value: 'spirits',  label: 'Spirits' },
  { value: 'beer',     label: 'Beer' },
  { value: 'mixer',    label: 'Mixers' },
  { value: 'food',     label: 'Food' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'other',    label: 'Other' },
]

const LS_KEY = 'pos_inventory_categories'

export const INV_CATEGORIES_CHANGED_EVENT = 'pos-inv-categories-changed'

export function loadInvCategories(): InvCat[] {
  if (typeof window === 'undefined') return DEFAULT_INV_CATEGORIES
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null')
    if (Array.isArray(saved) && saved.length > 0) return saved
  } catch { /* ignore */ }
  return DEFAULT_INV_CATEGORIES
}

export function saveInvCategories(cats: InvCat[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cats))
    window.dispatchEvent(new CustomEvent(INV_CATEGORIES_CHANGED_EVENT))
  } catch { /* ignore */ }
}

export async function fetchInvCategories(): Promise<InvCat[]> {
  if (typeof window === 'undefined') return DEFAULT_INV_CATEGORIES
  try {
    const res = await fetch('/api/inventory-categories')
    if (!res.ok) return loadInvCategories()
    const data = await res.json()
    const list: InvCat[] = Array.isArray(data.categories) ? data.categories : []
    if (list.length > 0) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
      return list
    }
    return DEFAULT_INV_CATEGORIES
  } catch {
    return loadInvCategories()
  }
}

export async function persistInvCategories(cats: InvCat[]): Promise<void> {
  saveInvCategories(cats)
  try {
    await fetch('/api/inventory-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: cats }),
    })
  } catch { /* local cache already updated; next fetch elsewhere retries */ }
}
