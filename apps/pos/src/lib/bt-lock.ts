// ─── Bluetooth socket mutex ──────────────────────────────────────────────────
// Android RFCOMM (SPP) allows exactly one operation on the printer socket at a
// time. If two callers touch it at once — e.g. the BluetoothManager's periodic
// health-check reconnect firing WHILE a receipt print is opening the socket —
// the link wedges with "already at opened state" and every following print/drawer
// attempt dies until the app is force-restarted. That is the "prints once, then
// nothing until I swipe-kill the app" symptom.
//
// Every native socket operation — connect / disconnect / write / openDrawer /
// isConnected — from BOTH the print path (printer.ts) and the BluetoothManager
// must run through withBtLock() so they serialize into one queue and can never
// overlap. This module has no imports so both files can share it with no cycle.

let tail: Promise<unknown> = Promise.resolve()

export function withBtLock<T>(fn: () => Promise<T>): Promise<T> {
  // Chain onto the tail; the next waiter proceeds even if this job rejects.
  const result = tail.then(() => fn())
  tail = result.then(() => {}, () => {})
  return result
}
