// Shared floor-plan table layout — the single source of truth for both the
// Floor Plan editor (src/app/pos/floor) and the POS order screen's table tabs
// (src/app/pos), so the tables a staff member can ring up always match the
// tables actually drawn on the floor plan.
//
// The layout lives in localStorage: both the editor and the POS run on the same
// staff tablet, so a shared device-local store keeps them in sync without a
// server round-trip. The POS listens for FLOOR_LAYOUT_CHANGED_EVENT (same-tab
// edits) and the native 'storage' event (another tab/window) to refresh its
// table tabs live whenever the layout is re-saved.

export type TableTile = {
  id: string
  tableNo: string
  x: number
  y: number
  w: number
  h: number
  shape: 'rect' | 'round'
  capacity: number
}

export const FLOOR_LS_KEY = 'pos_floor_layout'
export const FLOOR_LAYOUT_CHANGED_EVENT = 'pos-floor-layout-changed'

export const DEFAULT_TILES: TableTile[] = [
  { id: 'dt-T1',   tableNo: 'T1',   x: 40,  y: 40,  w: 120, h: 80,  shape: 'rect',  capacity: 4  },
  { id: 'dt-T2',   tableNo: 'T2',   x: 200, y: 40,  w: 120, h: 80,  shape: 'rect',  capacity: 4  },
  { id: 'dt-T3',   tableNo: 'T3',   x: 360, y: 40,  w: 120, h: 80,  shape: 'rect',  capacity: 4  },
  { id: 'dt-T4',   tableNo: 'T4',   x: 520, y: 40,  w: 120, h: 80,  shape: 'rect',  capacity: 4  },
  { id: 'dt-T5',   tableNo: 'T5',   x: 40,  y: 200, w: 160, h: 80,  shape: 'rect',  capacity: 6  },
  { id: 'dt-T6',   tableNo: 'T6',   x: 240, y: 200, w: 160, h: 80,  shape: 'rect',  capacity: 6  },
  { id: 'dt-VIP1', tableNo: 'VIP1', x: 600, y: 180, w: 120, h: 120, shape: 'round', capacity: 8  },
  { id: 'dt-BAR',  tableNo: 'BAR',  x: 40,  y: 400, w: 280, h: 80,  shape: 'rect',  capacity: 10 },
]

export function loadFloorTiles(): TableTile[] {
  if (typeof window === 'undefined') return DEFAULT_TILES
  try {
    const raw = localStorage.getItem(FLOOR_LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as TableTile[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch { /* ignore */ }
  return DEFAULT_TILES
}

// Ordered list of table numbers as drawn on the floor plan — this is exactly
// what the POS table tabs render, so ringing up follows the real room layout.
export function loadFloorTables(): string[] {
  return loadFloorTiles().map(t => t.tableNo)
}

export function saveFloorTiles(tiles: TableTile[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(FLOOR_LS_KEY, JSON.stringify(tiles))
    window.dispatchEvent(new CustomEvent(FLOOR_LAYOUT_CHANGED_EVENT))
  } catch { /* ignore */ }
}
