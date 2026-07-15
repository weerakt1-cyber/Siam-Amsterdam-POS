'use client'

import { useState, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'
import { useAuth } from '@/lib/pos-auth'
import {
  loadBarSettings, saveBarSettings,
  loadPrinterDevice, clearPrinterDevice,
  printReceipt, openCashDrawer, isNativePlatform,
  type BarSettings, type PrinterDevice, type ReceiptTemplate,
} from '@/lib/printer'
import { useBluetooth, bluetoothManager } from '@/lib/bluetooth-manager'
import { OwnerProfileBadge } from '@/components/pos/GoogleAuthGuard'

// ─── Section title ─────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
      {children}
    </h2>
  )
}

// ─── Settings input ────────────────────────────────────────────────────────────

function SettingInput({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className="flex items-center gap-4">
      <label className="text-sm text-gray-500 w-24 shrink-0">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400 transition"
      />
    </div>
  )
}

// ─── Payment (Omise) sub-component ────────────────────────────────────────────

function PaymentSettings() {
  const [publicKey, setPublicKey]   = useState('')
  const [secretKey, setSecretKey]   = useState('')          // only sent if the user types a new one
  const [secretSet, setSecretSet]   = useState(false)
  const [secretLast4, setSecretLast4] = useState<string | null>(null)
  const [mode, setMode]             = useState<'test' | 'live' | null>(null)
  const [fromEnv, setFromEnv]       = useState(false)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/payment/config')
      const d = await r.json()
      setPublicKey(d.publicKey ?? '')
      setSecretSet(!!d.secretConfigured)
      setSecretLast4(d.secretLast4 ?? null)
      setMode(d.mode ?? null)
      setFromEnv(!!d.fromEnv)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Live vs test is inferred from the key prefix the user pastes.
  const typedMode: 'test' | 'live' | null =
    publicKey.includes('_test_') || secretKey.includes('_test_') ? 'test'
    : (publicKey.startsWith('pkey_') || secretKey.startsWith('skey_')) ? 'live'
    : mode

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const body: Record<string, string> = { publicKey: publicKey.trim() }
      if (secretKey.trim()) body.secretKey = secretKey.trim()   // don't overwrite unless a new one is entered
      const r = await fetch('/api/payment/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'Save failed')
      setSecretKey('')
      await load()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-gray-500">Accept Card &amp; PromptPay online via Omise.</p>
        {typedMode && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            typedMode === 'live' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {typedMode === 'live' ? 'LIVE MODE' : 'TEST MODE'}
          </span>
        )}
      </div>

      {fromEnv && (
        <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
          Keys are currently set from Vercel environment variables. Saving here will override them.
        </p>
      )}

      <div>
        <label className="text-xs text-gray-500 mb-1 block">Publishable key (pkey_…)</label>
        <input
          value={publicKey}
          onChange={e => setPublicKey(e.target.value)}
          placeholder="pkey_test_xxxxxxxxxxxxxxxx"
          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400 transition"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">
          Secret key (skey_…)
          {secretSet && <span className="text-emerald-600 font-semibold ml-2">✓ set ••••{secretLast4}</span>}
        </label>
        <input
          type="password"
          value={secretKey}
          onChange={e => setSecretKey(e.target.value)}
          placeholder={secretSet ? 'Enter a new key to replace' : 'skey_test_xxxxxxxxxxxxxxxx'}
          autoComplete="off"
          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400 transition"
        />
        <p className="text-[11px] text-gray-400 mt-1">The secret key is stored server-side and never shown again.</p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-gray-900 text-white font-bold text-sm transition active:scale-95 disabled:opacity-50"
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Keys'}
        </button>
        <a href="https://dashboard.omise.co" target="_blank" rel="noopener noreferrer" className="text-xs text-amber-600 hover:underline">
          Get keys from Omise dashboard →
        </a>
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed border-t border-gray-100 pt-3">
        Test keys let you try the full flow now. To accept real money you need <strong>live keys</strong>, which
        Omise issues only after your company bank account and KYC are approved.
      </p>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

// ─── API & Webhooks sub-component ─────────────────────────────────────────────

type ApiKey     = { id: string; label: string; active: boolean; createdAt: string }
type Webhook    = { id: string; url: string; events: string[]; active: boolean; label?: string; createdAt: string }

const VALID_EVENTS = ['order.created', 'order.paid', 'member.created']

function ApiWebhooksSection() {
  const [keys, setKeys]             = useState<ApiKey[]>([])
  const [webhooks, setWebhooks]     = useState<Webhook[]>([])
  const [newKey, setNewKey]         = useState<string | null>(null)
  const [keyLabel, setKeyLabel]     = useState('')
  const [keyLoading, setKeyLoading] = useState(false)

  const [whUrl, setWhUrl]           = useState('')
  const [whLabel, setWhLabel]       = useState('')
  const [whEvents, setWhEvents]     = useState<string[]>(['order.created'])
  const [whLoading, setWhLoading]   = useState(false)
  const [whError, setWhError]       = useState('')

  const loadAll = useCallback(async () => {
    const safeJson = (p: Promise<Response>): Promise<Record<string, unknown>> =>
      p.then(r => r.ok ? r.json() : {}).catch(() => ({}))
    const [kr, wr]: Record<string, unknown>[] = await Promise.all([
      safeJson(fetch('/api/v1/keys')),
      safeJson(fetch('/api/v1/webhooks', { headers: { 'X-Internal': '1' } })),
    ])
    if (kr.keys)     setKeys(kr.keys as ApiKey[])
    if (wr.webhooks) setWebhooks(wr.webhooks as Webhook[])
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function genKey() {
    if (keyLoading) return
    setKeyLoading(true); setNewKey(null)
    const r = await fetch('/api/v1/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: keyLabel || 'Default' }),
    })
    const d = await r.json()
    if (d.key) { setNewKey(d.key); setKeyLabel('') }
    setKeyLoading(false)
    loadAll()
  }

  async function revokeKey(id: string) {
    if (!confirm('Revoke this API key? It will stop working immediately.')) return
    await fetch(`/api/v1/keys?id=${id}`, { method: 'DELETE' })
    loadAll()
  }

  async function addWebhook() {
    setWhError('')
    if (!whUrl.trim()) { setWhError('URL is required'); return }
    if (!whEvents.length) { setWhError('Select at least one event'); return }
    setWhLoading(true)
    const r = await fetch('/api/v1/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal': '1' },
      body: JSON.stringify({ url: whUrl.trim(), events: whEvents, label: whLabel.trim() || undefined }),
    })
    const d = await r.json()
    if (!r.ok) { setWhError(d.error ?? 'Failed to add webhook'); setWhLoading(false); return }
    setWhUrl(''); setWhLabel(''); setWhEvents(['order.created'])
    setWhLoading(false)
    loadAll()
  }

  async function deleteWebhook(id: string) {
    if (!confirm('Delete this webhook endpoint?')) return
    await fetch(`/api/v1/webhooks?id=${id}`, { method: 'DELETE', headers: { 'X-Internal': '1' } })
    loadAll()
  }

  function toggleEvent(ev: string) {
    setWhEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev])
  }

  return (
    <div className="flex flex-col gap-6">

      {/* API Keys */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">API Keys</h3>
            <p className="text-sm text-gray-400 mt-0.5">Keys grant read-only access to v1 API endpoints.</p>
          </div>
        </div>

        {/* Key list */}
        {keys.length > 0 && (
          <div className="flex flex-col divide-y divide-gray-50">
            {keys.map(k => (
              <div key={k.id} className="flex items-center justify-between py-2.5 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${k.active ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                  <span className="text-sm font-medium text-gray-900 truncate">{k.label}</span>
                  <span className="text-[10px] text-gray-300 font-mono shrink-0">
                    {new Date(k.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {k.active && (
                  <button
                    onClick={() => revokeKey(k.id)}
                    className="text-xs text-red-400 hover:text-red-600 shrink-0 transition"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* New key shown once */}
        {newKey && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs font-bold text-amber-700 mb-1">New API key — copy now, shown once!</p>
            <p className="text-xs font-mono break-all text-amber-900 select-all">{newKey}</p>
          </div>
        )}

        {/* Generate */}
        <div className="flex gap-2">
          <input
            value={keyLabel}
            onChange={e => setKeyLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && genKey()}
            placeholder="Label (e.g. Zapier, Dashboard)"
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400 transition"
          />
          <button
            onClick={genKey}
            disabled={keyLoading}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-700 transition active:scale-95 disabled:opacity-40 shrink-0"
          >
            {keyLoading ? '…' : '+ Generate'}
          </button>
        </div>
      </div>

      {/* Webhooks */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
        <div>
          <h3 className="font-bold text-gray-900">Outbound Webhooks</h3>
          <p className="text-sm text-gray-400 mt-0.5">
            POST JSON to your endpoint on each event. Signed with HMAC-SHA256 in{' '}
            <code className="text-[11px] bg-gray-100 px-1 rounded">X-Webhook-Signature</code>.
          </p>
        </div>

        {/* Webhook list */}
        {webhooks.length > 0 && (
          <div className="flex flex-col divide-y divide-gray-50">
            {webhooks.map(w => (
              <div key={w.id} className="flex items-start justify-between py-3 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${w.active ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                    <p className="text-sm font-medium text-gray-900 truncate">{w.label || w.url}</p>
                  </div>
                  {w.label && <p className="text-[11px] font-mono text-gray-400 truncate ml-4">{w.url}</p>}
                  <div className="flex flex-wrap gap-1 mt-1.5 ml-4">
                    {w.events.map(ev => (
                      <span key={ev} className="text-[10px] bg-gray-100 text-gray-500 rounded-md px-1.5 py-0.5 font-mono">
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => deleteWebhook(w.id)}
                  className="text-xs text-red-400 hover:text-red-600 shrink-0 mt-0.5 transition"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        {webhooks.length === 0 && (
          <div className="border-2 border-dashed border-gray-100 rounded-xl py-6 text-center text-gray-300">
            <p className="text-sm">No webhooks configured</p>
          </div>
        )}

        {/* Add webhook form */}
        <div className="flex flex-col gap-2 border-t border-gray-50 pt-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Add Endpoint</p>
          <input
            value={whLabel}
            onChange={e => setWhLabel(e.target.value)}
            placeholder="Label (optional)"
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400 transition"
          />
          <input
            value={whUrl}
            onChange={e => setWhUrl(e.target.value)}
            placeholder="https://your-service.com/webhook"
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-amber-400 transition"
          />
          <div className="flex flex-wrap gap-2">
            {VALID_EVENTS.map(ev => (
              <button
                key={ev}
                onClick={() => toggleEvent(ev)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-mono transition ${
                  whEvents.includes(ev)
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                }`}
              >
                {ev}
              </button>
            ))}
          </div>
          {whError && <p className="text-xs text-red-500">{whError}</p>}
          <button
            onClick={addWebhook}
            disabled={whLoading}
            className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-700 transition active:scale-95 disabled:opacity-40"
          >
            {whLoading ? '…' : 'Add Webhook'}
          </button>
        </div>
      </div>

      {/* Reference */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">API Reference</p>
        <div className="flex flex-col gap-1">
          {[
            { method: 'GET', path: '/api/v1/orders?from=&to=&status=&page=' },
            { method: 'GET', path: '/api/v1/menu' },
            { method: 'GET', path: '/api/v1/analytics/summary?date=' },
          ].map(({ method, path }) => (
            <div key={path} className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-amber-500 font-bold w-8">{method}</span>
              <span className="text-gray-500">{path}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          Include <span className="font-mono bg-white rounded px-1">X-API-Key: {'<key>'}</span> header in all requests.
        </p>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type TabKey = 'general' | 'printer' | 'qr' | 'notify' | 'payment' | 'integrations'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'general',      label: '⚙️ General' },
  { key: 'printer',      label: '🖨️ Receipt & Printer' },
  { key: 'qr',           label: '📱 QR Ordering' },
  { key: 'notify',       label: '🔔 Notifications' },
  { key: 'payment',      label: '💳 Payment' },
  { key: 'integrations', label: '🔌 Integrations' },
]

export default function SettingsPage() {
  const { user } = useAuth()
  const isManager = ['admin', 'manager'].includes(user?.role ?? '')

  const [activeTab, setActiveTab] = useState<TabKey>('general')

  // Bar settings
  const [cfg, setCfg]         = useState<BarSettings | null>(null)
  const [cfgSaved, setCfgSaved] = useState(false)

  // Bluetooth printer — driven by the shared BluetoothManager (auto-reconnect,
  // health-check every 8s, robust runtime permissions). This card only tracks
  // the persisted device (for the "Saved · Reconnect" UI), the Test-Print
  // status, and local errors; connection state lives in the manager.
  const bt = useBluetooth()
  const [savedDevice,  setSavedDevice]  = useState<PrinterDevice | null>(null)
  const [printStatus,  setPrintStatus]  = useState<'idle' | 'printing' | 'done' | 'error'>('idle')
  const [localError,   setLocalError]   = useState('')

  const connected    = bt.isConnected
  const scanning     = bt.isScanning
  const scanResults  = bt.scannedDevices
  const btConnecting = bt.isConnecting
  // Scan / Connect / Reconnect / Test-Print are disabled while busy.
  // NOTE: the Forget button is NEVER gated on this — a slow/hung connect must
  // always leave the user a way out.
  const btBusy       = scanning || btConnecting || printStatus === 'printing'
  const btError      = localError || bt.lastError

  // Cash drawer
  const [drawerStatus, setDrawerStatus] = useState<'idle' | 'opening' | 'done' | 'error'>('idle')
  const [drawerError,  setDrawerError]  = useState('')

  // LAN connection test
  const [lanTestStatus, setLanTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [lanTestMsg,    setLanTestMsg]    = useState('')

  const native = isNativePlatform()

  useEffect(() => {
    const cfg0 = loadBarSettings()
    setCfg(cfg0)
    loadPrinterDevice().then(setSavedDevice).catch(() => {})
    // The shared manager auto-connects on POS startup; opening this page also
    // (re)connects a saved Bluetooth printer so it's ready without a manual tap.
    // connectWithTimeout guarantees this can't lock the card on "connecting".
    if ((cfg0.printerConnectionType ?? 'bluetooth') === 'bluetooth') {
      bluetoothManager.autoConnectOnStartup().catch(() => {})
    }
    return () => { bluetoothManager.stopScan() }
  }, [])

  // Keep the "Saved" device label in sync whenever the manager connects.
  useEffect(() => {
    if (bt.connectedDevice) setSavedDevice(bt.connectedDevice)
  }, [bt.connectedDevice])

  // ─── Cash Drawer ──────────────────────────────────────────────────────────

  async function handleTestDrawer() {
    if (!cfg) return
    setDrawerStatus('opening')
    setDrawerError('')
    try {
      await openCashDrawer(cfg)
      setDrawerStatus('done')
      setTimeout(() => setDrawerStatus('idle'), 3000)
    } catch (err) {
      setDrawerStatus('error')
      setDrawerError(err instanceof Error ? err.message : 'เปิด drawer ล้มเหลว')
      setTimeout(() => setDrawerStatus('idle'), 4000)
    }
  }

  // ─── LAN connection test ──────────────────────────────────────────────────

  async function handleTestLanConnection() {
    if (!cfg?.printerLanIp) return
    setLanTestStatus('testing')
    setLanTestMsg('')
    try {
      const r = await fetch('/api/printer/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ip: cfg.printerLanIp, port: cfg.printerLanPort ?? 9100, bytes: [] }),
      })
      const data = await r.json() as { ok: boolean; error?: string }
      if (r.ok) {
        setLanTestStatus('ok')
        setLanTestMsg(`✓ Reached ${cfg.printerLanIp}:${cfg.printerLanPort ?? 9100}`)
      } else {
        setLanTestStatus('error')
        setLanTestMsg(data.error ?? 'Connection failed')
      }
    } catch (err) {
      setLanTestStatus('error')
      setLanTestMsg(err instanceof Error ? err.message : 'Network error')
    }
    setTimeout(() => { setLanTestStatus('idle'); setLanTestMsg('') }, 5000)
  }

  // ─── Bar settings ─────────────────────────────────────────────────────────

  function updateCfg(key: keyof BarSettings, val: string | number) {
    setCfg(prev => prev ? { ...prev, [key]: val } : prev)
    setCfgSaved(false)
  }

  function saveCfg() {
    if (!cfg) return
    saveBarSettings(cfg)
    setCfgSaved(true)
    window.dispatchEvent(new CustomEvent('pos-settings-changed'))
    setTimeout(() => setCfgSaved(false), 2500)
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCfg(prev => prev ? { ...prev, logoDataUrl: reader.result as string } : prev)
      setCfgSaved(false)
    }
    reader.readAsDataURL(file)
  }

  // ─── Bluetooth Scan ───────────────────────────────────────────────────────
  // All connection logic now lives in the shared BluetoothManager: it requests
  // runtime permissions, auto-restarts BLE scan before Android's 30s cutoff,
  // reconnects with backoff, and runs an 8s health-check. These handlers just
  // drive it and surface local Test-Print / error state.

  async function handleStartScan() {
    setLocalError('')
    bt.clearError()
    await bt.scan(() => {})
  }

  function handleStopScan() {
    bt.stopScan()
  }

  // ─── Bluetooth Connect ────────────────────────────────────────────────────

  async function handleConnect(device: PrinterDevice) {
    setLocalError('')
    bt.clearError()
    await bt.connect(device) // manager saves the device + starts health-check
  }

  // ─── Reconnect to saved printer ───────────────────────────────────────────

  async function handleReconnect() {
    if (!savedDevice) return
    setLocalError('')
    bt.clearError()
    await bt.reconnectSaved() // backoff reconnect, each attempt has a 12s timeout
  }

  // ─── Disconnect ───────────────────────────────────────────────────────────

  async function handleDisconnect() {
    setLocalError('')
    await bt.disconnect()
  }

  // ─── Forget printer ───────────────────────────────────────────────────────

  async function handleForget() {
    await bt.disconnect()
    await clearPrinterDevice()
    setSavedDevice(null)
    setLocalError('')
  }

  // ─── Test print ───────────────────────────────────────────────────────────

  async function handleTestPrint() {
    if (!cfg) return
    setLocalError('')
    setPrintStatus('printing')
    try {
      await printReceipt({
        orderId: 'TEST001', tableNo: 'T1',
        createdAt: new Date().toISOString(),
        staffName: 'Admin', memberName: 'Test Member',
        couponCode: 'HAPPY10',
        items: [{ name: 'Mojito', qty: 2, price: 200 }, { name: 'Heineken', qty: 1, price: 80 }],
        subtotal: 480, discountAmount: 48, total: 432, vatIncluded: 28,
        paymentMethod: 'cash', received: 500, change: 68,
      }, cfg)
      setPrintStatus('done')
      setTimeout(() => setPrintStatus('idle'), 3000)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Print failed')
      setPrintStatus('error')
      setTimeout(() => setPrintStatus('idle'), 3000)
    }
  }

  // ─── Google Sheets ────────────────────────────────────────────────────────

  const [sheetsCfg, setSheetsCfg]     = useState<{ configured: boolean; sheetId: string | null } | null>(null)
  const [sheetsSetup, setSheetsSetup] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [sheetsMsg, setSheetsMsg]     = useState('')

  // Telegram Bot state
  const [tgCfg, setTgCfg]     = useState<{
    configured: boolean; hasToken?: boolean; hasChatId?: boolean
    tokenOk?: boolean; botName?: string; botUsername?: string; chatId?: string
  } | null>(null)
  const [tgTest,          setTgTest]          = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [tgTestMsg,       setTgTestMsg]       = useState('')
  const [tgDaily,         setTgDaily]         = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [tgDailyMsg,      setTgDailyMsg]      = useState('')
  const [tgDetect,        setTgDetect]        = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [tgDetectResult,  setTgDetectResult]  = useState<{ chatId: string; from: string } | null>(null)

  // LINE Messaging API state
  const [lineCfg,      setLineCfg]      = useState<{
    configured: boolean; hasToken: boolean; hasTargetId: boolean
    tokenPreview: string | null; targetId: string | null
  } | null>(null)
  const [lineTest,     setLineTest]     = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [lineTestMsg,  setLineTestMsg]  = useState('')
  const [lineDaily,    setLineDaily]    = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [lineDailyMsg, setLineDailyMsg] = useState('')

  useEffect(() => {
    fetch('/api/sheets/setup').then(r => r.json()).then(setSheetsCfg).catch(() => {})
    fetch('/api/telegram').then(r => r.json()).then(setTgCfg).catch(() => {})
    fetch('/api/line').then(r => r.json()).then(setLineCfg).catch(() => {})
  }, [])

  async function handleSheetsSetup() {
    setSheetsSetup('loading')
    setSheetsMsg('')
    try {
      const r    = await fetch('/api/sheets/setup', { method: 'POST' })
      const data = await r.json()
      setSheetsMsg(data.message ?? (r.ok ? 'Done' : 'Error'))
      setSheetsSetup(r.ok ? 'done' : 'error')
      setTimeout(() => setSheetsSetup('idle'), 5000)
    } catch (err) {
      setSheetsMsg(err instanceof Error ? err.message : 'Network error')
      setSheetsSetup('error')
      setTimeout(() => setSheetsSetup('idle'), 5000)
    }
  }

  // ─── Telegram ─────────────────────────────────────────────────────────────

  async function handleTgTest() {
    setTgTest('loading')
    setTgTestMsg('')
    try {
      const r    = await fetch('/api/telegram', { method: 'POST' })
      const data = await r.json()
      setTgTestMsg(data.error ?? (r.ok ? 'Sent! Check your Telegram 🎉' : 'Failed to send'))
      setTgTest(r.ok ? 'done' : 'error')
      if (r.ok) fetch('/api/telegram').then(r2 => r2.json()).then(setTgCfg).catch(() => {})
      setTimeout(() => setTgTest('idle'), 5000)
    } catch (err) {
      setTgTestMsg(err instanceof Error ? err.message : 'Network error')
      setTgTest('error')
      setTimeout(() => setTgTest('idle'), 5000)
    }
  }

  async function handleTgDaily() {
    setTgDaily('loading')
    setTgDailyMsg('')
    try {
      const r    = await fetch('/api/telegram/daily', { method: 'POST' })
      const data = await r.json()
      setTgDailyMsg(data.error ?? (r.ok ? `Sent! ${data.orders} orders · ฿${(data.revenue ?? 0).toLocaleString()} 🎉` : 'Failed to send'))
      setTgDaily(r.ok ? 'done' : 'error')
      setTimeout(() => setTgDaily('idle'), 6000)
    } catch (err) {
      setTgDailyMsg(err instanceof Error ? err.message : 'Network error')
      setTgDaily('error')
      setTimeout(() => setTgDaily('idle'), 5000)
    }
  }

  async function handleTgDetect() {
    setTgDetect('loading')
    setTgDetectResult(null)
    setTgTestMsg('')
    try {
      const r    = await fetch('/api/telegram/setup')
      const data = await r.json()
      if (r.ok && data.ok) {
        setTgDetectResult({ chatId: data.chatId, from: data.from ?? '' })
        setTgDetect('done')
      } else {
        setTgTestMsg(data.error ?? 'ไม่พบ Chat ID')
        setTgDetect('error')
        setTimeout(() => setTgDetect('idle'), 6000)
      }
    } catch (err) {
      setTgTestMsg(err instanceof Error ? err.message : 'Network error')
      setTgDetect('error')
      setTimeout(() => setTgDetect('idle'), 5000)
    }
  }

  // ─── LINE Notify ──────────────────────────────────────────────────────────

  async function handleLineTest() {
    setLineTest('loading')
    setLineTestMsg('')
    try {
      const r    = await fetch('/api/line', { method: 'POST' })
      const data = await r.json()
      setLineTestMsg(data.error ?? (r.ok ? 'Sent! Check your LINE 🎉' : 'Failed to send'))
      setLineTest(r.ok ? 'done' : 'error')
      setTimeout(() => setLineTest('idle'), 5000)
    } catch (err) {
      setLineTestMsg(err instanceof Error ? err.message : 'Network error')
      setLineTest('error')
      setTimeout(() => setLineTest('idle'), 5000)
    }
  }

  async function handleLineDaily() {
    setLineDaily('loading')
    setLineDailyMsg('')
    try {
      const r    = await fetch('/api/line/daily', { method: 'POST' })
      const data = await r.json()
      setLineDailyMsg(data.error ?? (r.ok ? `Sent! ${data.orders} orders · ฿${(data.revenue ?? 0).toLocaleString()} 🎉` : 'Failed to send'))
      setLineDaily(r.ok ? 'done' : 'error')
      setTimeout(() => setLineDaily('idle'), 6000)
    } catch (err) {
      setLineDailyMsg(err instanceof Error ? err.message : 'Network error')
      setLineDaily('error')
      setTimeout(() => setLineDaily('idle'), 5000)
    }
  }

  // ─── QR Self-Ordering ────────────────────────────────────────────────────
  // Table list is sourced directly from the Floor Plan (localStorage
  // 'pos_floor_layout') — same key floor/page.tsx writes to. This guarantees
  // QR codes always match real tables (name, count) instead of a separate
  // prefix+count formula that could drift out of sync (e.g. rename T5 →
  // Gameroom on the floor plan, but QR sheet still printed "T5").

  const FLOOR_LS_KEY = 'pos_floor_layout'

  const [qrBaseUrl,   setQrBaseUrl]   = useState('')
  const [qrImages,    setQrImages]    = useState<{ tableNo: string; dataUrl: string }[]>([])
  const [qrLoading,   setQrLoading]   = useState(false)
  const [floorTables, setFloorTables] = useState<string[]>([])
  const [selectedQrTables, setSelectedQrTables] = useState<Set<string>>(new Set())

  // ตั้งค่าเริ่มต้นหลัง mount เท่านั้น — กัน hydration mismatch (window ไม่มีฝั่ง server)
  // ค่าเริ่มต้นคือ origin ปัจจุบัน ซึ่งตอน dev local จะเป็น localhost — ใช้ไม่ได้ถ้าสแกนจากมือถือ
  // เครื่องอื่น ต้องแก้เป็น LAN IP ของเครื่องนี้ (เช่น http://192.168.1.50:3000) หรือโดเมนจริงตอน deploy
  useEffect(() => {
    setQrBaseUrl(window.location.origin)
  }, [])

  const loadFloorTables = useCallback(() => {
    try {
      const raw = localStorage.getItem(FLOOR_LS_KEY)
      if (raw) {
        const tiles = JSON.parse(raw) as { tableNo: string }[]
        const names = tiles.map(t => t.tableNo).filter(Boolean)
        setFloorTables(names)
        setSelectedQrTables(new Set(names))
        return
      }
    } catch { /* ignore */ }
    setFloorTables([])
    setSelectedQrTables(new Set())
  }, [])

  useEffect(() => { loadFloorTables() }, [loadFloorTables])

  function toggleQrTable(tableNo: string) {
    setSelectedQrTables(prev => {
      const next = new Set(prev)
      if (next.has(tableNo)) next.delete(tableNo)
      else next.add(tableNo)
      return next
    })
  }

  const generateQRs = useCallback(async () => {
    const tableNos = floorTables.filter(t => selectedQrTables.has(t))
    if (!tableNos.length) return
    setQrLoading(true)
    const base = qrBaseUrl || window.location.origin
    const results: { tableNo: string; dataUrl: string }[] = []
    for (const tableNo of tableNos) {
      const url     = `${base}/order/${tableNo}`
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: '#111111', light: '#FFFFFF' } })
      results.push({ tableNo, dataUrl })
    }
    setQrImages(results)
    setQrLoading(false)
  }, [floorTables, selectedQrTables, qrBaseUrl])

  function downloadQR(tableNo: string, dataUrl: string) {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `QR-${tableNo}.png`
    a.click()
  }

  function printQRSheet() {
    const base = qrBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
    const win = window.open('', '_blank', 'width=800,height=600')
    if (!win) return
    const cells = qrImages.map(({ tableNo, dataUrl }) => `
      <div style="display:flex;flex-direction:column;align-items:center;padding:12px;border:1px solid #eee;border-radius:12px;break-inside:avoid">
        <img src="${dataUrl}" style="width:120px;height:120px" />
        <p style="margin:6px 0 2px;font-size:14px;font-weight:900;font-family:sans-serif">Table ${tableNo}</p>
        <p style="margin:0;font-size:9px;color:#888;font-family:monospace;word-break:break-all;text-align:center">${base}/order/${tableNo}</p>
      </div>`).join('')
    win.document.write(`<!DOCTYPE html><html><head><title>QR Codes — ${cfg?.barName || 'Your Bar'}</title>
      <style>body{margin:24px;font-family:sans-serif}h1{font-size:18px;margin-bottom:16px}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px}
      @media print{@page{size:A4;margin:16mm}}</style></head>
      <body><h1>QR Self-Ordering — ${cfg?.barName || 'Your Bar'}</h1>
      <div class="grid">${cells}</div></body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  const SYSTEM_CARDS = [
    {
      icon: '🤖',
      title: 'AI Model',
      description: 'Claude model used for analytics and smart suggestions.',
      badge: 'claude-sonnet-4-6',
    },
    {
      icon: '📱',
      title: 'QR Self-Order',
      description: 'Customer-facing order page URL. Print as QR code for each table.',
      badge: '/order/[tableNo]',
      extra: 'qr-url',
    },
  ]

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden bg-gray-50 text-gray-900"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-400 mt-0.5">Business info, receipt, printer, and system configuration</p>
      </div>

      {/* Tab nav */}
      <div className="px-6 border-b border-gray-200 bg-white shrink-0 flex gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition ${
              activeTab === t.key
                ? 'border-amber-500 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8 max-w-3xl">

        {/* ── Business Information ── */}
        {activeTab === 'general' && <section>
          <SectionTitle>Business Information</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
            {cfg && (
              <>
                {/* Logo upload */}
                <div className="flex items-center gap-4">
                  <label className="text-sm text-gray-500 w-24 shrink-0">Logo</label>
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 shrink-0 flex items-center justify-center">
                      <img
                        src={cfg.logoDataUrl || '/logo.png'}
                        alt="Logo"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="cursor-pointer inline-block px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition text-center">
                        {cfg.logoDataUrl ? 'Change' : 'Upload'}
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                      </label>
                      {cfg.logoDataUrl && (
                        <button
                          onClick={() => { setCfg(prev => prev ? { ...prev, logoDataUrl: '' } : prev); setCfgSaved(false) }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-50 transition"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <SettingInput label="Business Name"  value={cfg.barName}               onChange={v => updateCfg('barName', v)}         placeholder="🍹 Your Bar Name" />
                <SettingInput label="Address"        value={cfg.address}               onChange={v => updateCfg('address', v)}         placeholder="Sukhumvit Soi 11, Bangkok" />
                <SettingInput label="Phone"          value={cfg.phone}                 onChange={v => updateCfg('phone', v)}           placeholder="02-xxx-xxxx" />
                <SettingInput label="Tax ID"         value={cfg.taxId}                 onChange={v => updateCfg('taxId', v)}           placeholder="0-0000-00000-00-0" />
                <SettingInput label="PromptPay"      value={cfg.promptpayNumber ?? ''} onChange={v => updateCfg('promptpayNumber', v)} placeholder="0812345678" />
                <SettingInput label="Google Review Link" value={cfg.googleReviewUrl ?? ''} onChange={v => updateCfg('googleReviewUrl', v)} placeholder="https://maps.app.goo.gl/..." />

                <div className="pt-1">
                  <button
                    onClick={saveCfg}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 ${
                      cfgSaved ? 'bg-emerald-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-black'
                    }`}
                  >
                    {cfgSaved ? '✓ Saved!' : 'Save Changes'}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>}

        {/* ── Security ── */}
        {activeTab === 'general' && <section>
          <SectionTitle>Security</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
            {cfg && (
              <>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Display Time Lock</p>
                  <p className="text-xs text-gray-400 mt-0.5 mb-3">
                    Re-request staff PIN after this much inactivity, instead of on every screen-off or app switch.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { val: 0,  label: 'Off' },
                      { val: 5,  label: '5 min' },
                      { val: 10, label: '10 min' },
                      { val: 15, label: '15 min' },
                      { val: 30, label: '30 min' },
                    ] as const).map(opt => (
                      <button
                        key={opt.val}
                        onClick={() => updateCfg('autoLockMinutes', opt.val)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition active:scale-95 ${
                          (cfg.autoLockMinutes ?? 10) === opt.val ? 'bg-amber-500 text-black' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    onClick={saveCfg}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 ${
                      cfgSaved ? 'bg-emerald-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-black'
                    }`}
                  >
                    {cfgSaved ? '✓ Saved!' : 'Save Changes'}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>}

        {/* ── Revenue Targets ── */}
        {activeTab === 'general' && <section>
          <SectionTitle>Revenue Targets</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
            {cfg && (
              <>
                <p className="text-xs text-gray-400 -mt-1 mb-1">
                  Set sales goals to get 🔔 alerts when you hit them (or get close). Leave 0 to disable.
                </p>
                {([
                  { key: 'dailyRevenueTarget'   as const, label: 'Daily target',   placeholder: 'e.g. 20000' },
                  { key: 'weeklyRevenueTarget'  as const, label: 'Weekly target',  placeholder: 'e.g. 120000' },
                  { key: 'monthlyRevenueTarget' as const, label: 'Monthly target', placeholder: 'e.g. 500000' },
                ]).map(t => (
                  <div key={t.key} className="flex items-center gap-4">
                    <label className="text-sm text-gray-500 w-28 shrink-0">{t.label}</label>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-gray-400 text-sm">฿</span>
                      <input
                        type="number"
                        min={0}
                        value={cfg[t.key] || ''}
                        onChange={e => updateCfg(t.key, Math.max(0, Number(e.target.value) || 0))}
                        placeholder={t.placeholder}
                        className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400 transition"
                      />
                    </div>
                  </div>
                ))}
                <div className="pt-1">
                  <button
                    onClick={saveCfg}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 ${
                      cfgSaved ? 'bg-emerald-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-black'
                    }`}
                  >
                    {cfgSaved ? '✓ Saved!' : 'Save Changes'}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>}

        {/* ── Receipt & Printer ── */}
        {activeTab === 'printer' && <section>
          <SectionTitle>Receipt &amp; Printer</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-5 shadow-sm">
            {cfg && (
              <>
                {/* Template selector */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-3">Receipt Template</p>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { id: 'classic' as ReceiptTemplate,  label: 'Classic',  desc: 'Monospace · Retro' },
                      { id: 'modern'  as ReceiptTemplate,  label: 'Modern',   desc: 'Clean · Stylish' },
                      { id: 'minimal' as ReceiptTemplate,  label: 'Minimal',  desc: 'Simple · Fast' },
                    ]).map(t => {
                      const active = (cfg.receiptTemplate ?? 'classic') === t.id
                      return (
                        <button
                          key={t.id}
                          onClick={() => updateCfg('receiptTemplate', t.id)}
                          className={`relative flex flex-col items-center rounded-2xl border-2 p-3 transition active:scale-95 ${
                            active ? 'border-amber-500 bg-amber-50' : 'border-gray-100 bg-gray-50 hover:border-gray-300'
                          }`}
                        >
                          {/* Mini preview */}
                          <div className={`w-full rounded-lg overflow-hidden mb-2.5 ${active ? 'shadow-sm' : ''}`}
                               style={{ aspectRatio: '0.6', background: '#fff', border: '1px solid #eee' }}>
                            {t.id === 'classic' && (
                              <div className="p-1.5 flex flex-col gap-0.5" style={{ fontFamily: 'monospace', fontSize: 4 }}>
                                <div className="text-center font-bold text-[5px]">── CHECK BILL ──</div>
                                <div className="text-center font-bold text-[6px] mt-0.5">BAR NAME</div>
                                <div className="border-t border-dashed border-gray-300 my-1" />
                                <div className="flex justify-between"><span>Item A ×2</span><span>฿200</span></div>
                                <div className="flex justify-between"><span>Item B ×1</span><span>฿80</span></div>
                                <div className="border-t border-gray-400 my-1" />
                                <div className="flex justify-between font-bold text-[5.5px]"><span>TOTAL</span><span>฿280</span></div>
                                <div className="text-center text-[4px] text-gray-400 mt-1">Thank you!</div>
                              </div>
                            )}
                            {t.id === 'modern' && (
                              <div className="p-2 flex flex-col gap-1" style={{ fontFamily: 'sans-serif', fontSize: 4 }}>
                                <div className="bg-gray-900 rounded text-white text-center py-1 text-[5.5px] font-bold">BAR NAME</div>
                                <div className="text-gray-400 text-[3.5px] text-center">Bangkok · Table T1</div>
                                <div className="border-t border-gray-200 my-0.5" />
                                <div className="flex justify-between"><span className="text-gray-600">Item A ×2</span><span>฿200</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">Item B ×1</span><span>฿80</span></div>
                                <div className="mt-1 bg-amber-50 rounded px-1 py-0.5 flex justify-between text-[5px] font-bold text-amber-700">
                                  <span>TOTAL</span><span>฿280</span>
                                </div>
                                <div className="text-center text-[3.5px] text-gray-400 mt-0.5">Thank you · Come again 🙏</div>
                              </div>
                            )}
                            {t.id === 'minimal' && (
                              <div className="p-2 flex flex-col gap-1.5" style={{ fontFamily: 'sans-serif', fontSize: 4 }}>
                                <div className="font-bold text-[5px]">BAR NAME</div>
                                <div className="border-t border-gray-200" />
                                <div className="flex justify-between text-gray-700"><span>Item A ×2</span><span>฿200</span></div>
                                <div className="flex justify-between text-gray-700"><span>Item B ×1</span><span>฿80</span></div>
                                <div className="border-t border-gray-200 mt-0.5" />
                                <div className="flex justify-between font-bold text-[5.5px]"><span>Total</span><span>฿280</span></div>
                              </div>
                            )}
                          </div>

                          <p className={`text-xs font-bold leading-none ${active ? 'text-amber-700' : 'text-gray-600'}`}>{t.label}</p>
                          <p className={`text-[10px] mt-0.5 ${active ? 'text-amber-500' : 'text-gray-400'}`}>{t.desc}</p>
                          {active && (
                            <span className="absolute top-2 right-2 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center text-white text-[9px] font-black">✓</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Footer text */}
                <div className="flex items-start gap-4">
                  <label className="text-sm text-gray-500 w-28 shrink-0 pt-2.5">Footer Text</label>
                  <textarea
                    value={cfg.footer}
                    onChange={e => updateCfg('footer', e.target.value)}
                    rows={2}
                    placeholder={'ขอบคุณที่ใช้บริการ\nThank you!'}
                    className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400 transition resize-none"
                  />
                </div>

                {/* Paper size */}
                <div className="flex items-center gap-4">
                  <label className="text-sm text-gray-500 w-28 shrink-0">Paper Size</label>
                  <div className="flex gap-2">
                    {([{ val: 32, label: '58 mm' }, { val: 48, label: '80 mm' }] as const).map(opt => (
                      <button
                        key={opt.val}
                        onClick={() => updateCfg('width', opt.val)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition active:scale-95 ${
                          cfg.width === opt.val ? 'bg-amber-500 text-black' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={saveCfg}
                  className={`self-start px-6 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 ${
                    cfgSaved ? 'bg-emerald-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-black'
                  }`}
                >
                  {cfgSaved ? '✓ Saved!' : 'Save Receipt Settings'}
                </button>
              </>
            )}

            {/* ── Printer Connection ── */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Printer Connection</p>

              {/* Connection type toggle */}
              {cfg && (
                <div className="flex gap-2 mb-4">
                  {(['bluetooth', 'lan'] as const).map(type => {
                    const active = (cfg.printerConnectionType ?? 'bluetooth') === type
                    return (
                      <button
                        key={type}
                        onClick={() => { updateCfg('printerConnectionType', type); setCfgSaved(false) }}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 ${
                          active ? 'bg-stone-900 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {type === 'bluetooth' ? '🔵 Bluetooth' : '🌐 LAN / Wi-Fi'}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* ── LAN section ── */}
              {cfg && (cfg.printerConnectionType ?? 'bluetooth') === 'lan' && (
                <div className="flex flex-col gap-3">
                  <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-xs text-sky-700 leading-relaxed">
                    <p className="font-semibold mb-0.5">🌐 LAN / Wi-Fi Mode</p>
                    <p>ใช้ได้ทั้งบน Browser และ Android APK — ปริ้นเตอร์ต้องอยู่ใน Wi-Fi เดียวกัน</p>
                    <p className="mt-1 text-sky-500">Port มาตรฐาน ESC/POS: <strong>9100</strong> (Epson · Xprinter · Star · Citizen)</p>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="text-sm text-gray-500 w-28 shrink-0">IP Address</label>
                    <input
                      type="text"
                      value={cfg.printerLanIp ?? ''}
                      onChange={e => updateCfg('printerLanIp', e.target.value)}
                      placeholder="192.168.1.105"
                      className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400 transition"
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="text-sm text-gray-500 w-28 shrink-0">Port</label>
                    <input
                      type="number"
                      value={cfg.printerLanPort ?? 9100}
                      onChange={e => updateCfg('printerLanPort', Number(e.target.value))}
                      className="w-28 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-900 focus:outline-none focus:border-amber-400 transition"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleTestLanConnection}
                      disabled={!cfg.printerLanIp || lanTestStatus === 'testing'}
                      className={`px-5 py-2 rounded-xl text-sm font-bold transition active:scale-95 ${
                        lanTestStatus === 'ok'      ? 'bg-emerald-500 text-white' :
                        lanTestStatus === 'error'   ? 'bg-red-100 text-red-600 border border-red-200' :
                        lanTestStatus === 'testing' ? 'bg-gray-200 text-gray-400 cursor-wait' :
                        !cfg.printerLanIp           ? 'bg-gray-100 text-gray-300 cursor-not-allowed' :
                                                      'bg-sky-500 hover:bg-sky-600 text-white'
                      }`}
                    >
                      {lanTestStatus === 'testing' ? '⏳ Testing...' :
                       lanTestStatus === 'ok'      ? '✓ Connected!' :
                       lanTestStatus === 'error'   ? '✗ Failed' :
                                                     '🔌 Test Connection'}
                    </button>
                    {lanTestMsg && (
                      <p className={`text-xs ${lanTestStatus === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>{lanTestMsg}</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Bluetooth section ── */}
              {(cfg?.printerConnectionType ?? 'bluetooth') === 'bluetooth' && (
                <>
                  {!native && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 leading-relaxed mb-4">
                      <p className="font-semibold mb-0.5">ℹ️ Browser Mode</p>
                      <p>Bluetooth SPP ใช้งานได้เฉพาะใน Android APK (Capacitor) เท่านั้น</p>
                      <p className="mt-1 text-blue-500">Build APK ด้วย <code className="font-mono bg-blue-100 px-1 rounded">npx cap run android</code></p>
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${connected ? 'bg-emerald-400' : savedDevice ? 'bg-amber-400' : 'bg-gray-300'}`} />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {connected ? savedDevice?.name ?? 'Connected' : savedDevice ? savedDevice.name : 'No printer configured'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {connected ? '🟢 Connected · ' + (savedDevice?.address ?? '') : savedDevice ? '🔴 Saved · tap Reconnect' : 'Scan to find and pair a printer'}
                        </p>
                      </div>
                    </div>
                    {connected ? (
                      <button onClick={handleDisconnect} className="px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 text-gray-500 hover:bg-gray-100 transition">
                        Disconnect
                      </button>
                    ) : savedDevice ? (
                      <div className="flex gap-2">
                        <button onClick={handleReconnect} disabled={btBusy} className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white transition active:scale-95">
                          {btConnecting ? '...' : 'Reconnect'}
                        </button>
                        <button onClick={handleForget} className="px-3 py-2 rounded-xl text-xs font-semibold border border-red-100 text-red-400 hover:bg-red-50 transition">
                          Forget
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {!connected && (
                    <div className="flex flex-col gap-3">
                      {!scanning ? (
                        <button onClick={handleStartScan} disabled={btBusy}
                          className={`py-2.5 rounded-xl text-sm font-bold transition active:scale-95 ${btBusy ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}>
                          🔍 Scan for Printers
                        </button>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 flex items-center gap-2 py-2.5 px-4 bg-blue-50 border border-blue-100 rounded-xl">
                            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
                            <span className="text-sm text-blue-700 font-medium">กำลังสแกน...</span>
                          </div>
                          <button onClick={handleStopScan} className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-500 hover:bg-gray-100 transition">Stop</button>
                        </div>
                      )}
                      {scanResults.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <p className="text-xs text-gray-400 font-semibold px-1">พบ {scanResults.length} เครื่อง — เลือกเพื่อเชื่อมต่อ</p>
                          {scanResults.map(device => (
                            <button key={device.address} onClick={() => handleConnect(device)} disabled={btBusy}
                              className="flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-amber-50 border border-gray-100 hover:border-amber-200 rounded-xl transition active:scale-[0.98]">
                              <div className="text-left">
                                <p className="text-sm font-semibold text-gray-900">{device.name || 'Unknown Device'}</p>
                                <p className="text-xs font-mono text-gray-400">{device.address}</p>
                              </div>
                              <span className="text-xs font-bold text-blue-500">Connect →</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {scanning && scanResults.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-2">ยังไม่พบเครื่อง — ตรวจสอบว่าเปิดปริ้นเตอร์และ Bluetooth แล้ว</p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ── Test print + cash drawer (both modes) ── */}
              {cfg && ((cfg.printerConnectionType ?? 'bluetooth') === 'bluetooth' ? connected : !!cfg.printerLanIp) && (
                <div className="flex flex-col gap-2 mt-3">
                  <div className="flex gap-2">
                    <button onClick={handleTestPrint} disabled={btBusy}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition active:scale-95 ${
                        printStatus === 'done' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                        btBusy               ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                                               'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                      {printStatus === 'printing' ? '⏳ Printing...' : printStatus === 'done' ? '✓ Printed!' : '🖨️ Test Print'}
                    </button>
                    <button onClick={handleTestDrawer} disabled={btBusy || drawerStatus === 'opening'}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition active:scale-95 ${
                        drawerStatus === 'done'    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                        drawerStatus === 'error'   ? 'bg-red-50 text-red-500 border border-red-100' :
                        drawerStatus === 'opening' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                                                     'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-100'}`}>
                      {drawerStatus === 'opening' ? '⏳ Opening...' : drawerStatus === 'done' ? '✓ Open!' : drawerStatus === 'error' ? '✗ Failed' : '💰 Test Drawer'}
                    </button>
                  </div>
                  {drawerStatus === 'error' && drawerError && (
                    <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-xs text-red-600">{drawerError}</div>
                  )}
                </div>
              )}

              {btError && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-600 mt-3">{btError}</div>
              )}

              <p className="text-[11px] text-gray-400 leading-relaxed mt-3">
                {cfg && (cfg.printerConnectionType ?? 'bluetooth') === 'lan'
                  ? 'LAN/Wi-Fi: TCP port 9100 (ESC/POS) — รองรับทุก brand (Epson, Xprinter, Star, Citizen) — ใช้ได้ทั้ง Browser และ Android APK'
                  : 'Bluetooth SPP/Classic — ต้องใช้ Android APK. Cash drawer เชื่อมต่อผ่าน RJ11/RJ12 — เปิดอัตโนมัติเมื่อรับเงินสด.'
                }
              </p>
            </div>
          </div>
        </section>}

        {/* ── Payment (Omise) ── */}
        {activeTab === 'payment' && <section>
          <SectionTitle>Online Payment · Omise</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <PaymentSettings />
          </div>
        </section>}

        {/* ── Google Sheets ── */}
        {activeTab === 'integrations' && <section>
          <SectionTitle>Google Sheets Export</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📊</span>
                <div>
                  <h3 className="font-bold text-gray-900">Auto-export to Sheets</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Every order is appended to your spreadsheet automatically</p>
                </div>
              </div>
              <button
                onClick={handleSheetsSetup}
                disabled={sheetsSetup === 'loading' || sheetsCfg?.configured === false}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 shrink-0 ${
                  sheetsSetup === 'done'    ? 'bg-emerald-500 text-white' :
                  sheetsSetup === 'error'   ? 'bg-red-100 text-red-600 border border-red-200' :
                  sheetsSetup === 'loading' ? 'bg-gray-200 text-gray-400 cursor-wait' :
                  !sheetsCfg?.configured   ? 'bg-gray-100 text-gray-300 cursor-not-allowed' :
                                             'bg-emerald-500 hover:bg-emerald-400 text-white'
                }`}
              >
                {sheetsSetup === 'loading' ? 'Setting up...' :
                 sheetsSetup === 'done'    ? '✓ Done!' :
                 sheetsSetup === 'error'   ? '✗ Failed' :
                                            '⚙ Setup Headers'}
              </button>
            </div>

            <div className={`rounded-xl px-4 py-3 flex items-center justify-between gap-3 border ${
              sheetsCfg === null       ? 'bg-gray-50 border-gray-100' :
              sheetsCfg.configured    ? 'bg-emerald-50 border-emerald-100' :
                                        'bg-amber-50 border-amber-200'
            }`}>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Sheet ID</p>
                {sheetsCfg === null ? (
                  <p className="text-sm text-gray-400">Checking...</p>
                ) : sheetsCfg.configured ? (
                  <code className="text-xs font-mono text-emerald-700 break-all">{sheetsCfg.sheetId}</code>
                ) : (
                  <code className="text-sm font-mono text-amber-700">Not configured</code>
                )}
              </div>
              {sheetsCfg !== null && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                  sheetsCfg.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {sheetsCfg.configured ? '✓ Configured' : 'Set env vars'}
                </span>
              )}
            </div>

            {sheetsMsg && (
              <div className={`rounded-xl px-4 py-3 text-xs leading-snug ${
                sheetsSetup === 'error'
                  ? 'bg-red-50 border border-red-100 text-red-600'
                  : 'bg-emerald-50 border border-emerald-100 text-emerald-700'
              }`}>
                {sheetsMsg}
              </div>
            )}

          </div>
        </section>}

        {/* ── Telegram Bot ── */}
        {activeTab === 'notify' && <>
        <section>
          <SectionTitle>Telegram Bot Notifications</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">

            {/* Status row */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">✈️</span>
                <div>
                  <h3 className="font-bold text-gray-900">Baze POS Bot</h3>
                  <p className="text-xs text-gray-400 mt-0.5">New order alerts + daily revenue summary</p>
                </div>
              </div>
              {tgCfg !== null && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                  tgCfg.configured && tgCfg.tokenOk
                    ? 'bg-emerald-100 text-emerald-700'
                    : tgCfg.hasToken
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {tgCfg.configured && tgCfg.tokenOk ? '✓ Active'
                    : tgCfg.hasToken ? 'Partial'
                    : 'Not set'}
                </span>
              )}
            </div>

            {/* Config info (ถ้าตั้งค่าแล้ว) */}
            {tgCfg?.configured && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Bot</span>
                  <span className="text-sm font-semibold text-emerald-700">
                    {tgCfg.botName ?? '—'}
                    {tgCfg.botUsername && <span className="font-normal text-gray-400"> @{tgCfg.botUsername}</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Chat ID</span>
                  <code className="text-xs font-mono text-emerald-700">{tgCfg.chatId}</code>
                </div>
              </div>
            )}

            {/* Test message + Daily summary buttons */}
            {tgCfg?.configured && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={handleTgTest}
                    disabled={tgTest === 'loading'}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 ${
                      tgTest === 'done'    ? 'bg-emerald-500 text-white' :
                      tgTest === 'error'   ? 'bg-red-100 text-red-600 border border-red-200' :
                      tgTest === 'loading' ? 'bg-gray-200 text-gray-400 cursor-wait' :
                                             'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                  >
                    {tgTest === 'loading' ? 'Sending...' :
                     tgTest === 'done'    ? '✓ Sent!' :
                     tgTest === 'error'   ? '✗ Failed' :
                                            '✈️ Test Message'}
                  </button>
                  <button
                    onClick={handleTgDaily}
                    disabled={tgDaily === 'loading'}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 ${
                      tgDaily === 'done'    ? 'bg-emerald-500 text-white' :
                      tgDaily === 'error'   ? 'bg-red-100 text-red-600 border border-red-200' :
                      tgDaily === 'loading' ? 'bg-gray-200 text-gray-400 cursor-wait' :
                                              'bg-amber-500 hover:bg-amber-400 text-black'
                    }`}
                  >
                    {tgDaily === 'loading' ? 'Sending...' :
                     tgDaily === 'done'    ? '✓ Sent!' :
                     tgDaily === 'error'   ? '✗ Failed' :
                                             '📊 Daily Summary'}
                  </button>
                </div>
                {tgTestMsg && (
                  <p className={`text-xs px-1 ${tgTest === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
                    {tgTestMsg}
                  </p>
                )}
                {tgDailyMsg && (
                  <p className={`text-xs px-1 ${tgDaily === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
                    {tgDailyMsg}
                  </p>
                )}
              </div>
            )}

            {/* Detect Chat ID tool */}
            {tgCfg?.hasToken && !tgCfg.configured && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex flex-col gap-3">
                <p className="text-xs font-semibold text-amber-700">Token found — detect Chat ID</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Send any message to the Bot first, then click the button below to auto-detect your Chat ID.
                </p>
                <button
                  onClick={handleTgDetect}
                  disabled={tgDetect === 'loading'}
                  className={`py-2 rounded-xl text-sm font-semibold transition active:scale-95 ${
                    tgDetect === 'loading' ? 'bg-gray-200 text-gray-400 cursor-wait' :
                                             'bg-amber-500 hover:bg-amber-400 text-black'
                  }`}
                >
                  {tgDetect === 'loading' ? 'Detecting...' : '🔍 Detect Chat ID'}
                </button>
                {tgDetectResult && (
                  <div className="bg-white border border-emerald-200 rounded-xl px-4 py-3 flex flex-col gap-1">
                    <p className="text-xs font-semibold text-emerald-700">Chat ID found!</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Chat ID</span>
                      <code className="text-sm font-mono font-bold text-emerald-700 select-all">{tgDetectResult.chatId}</code>
                    </div>
                    {tgDetectResult.from && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">From</span>
                        <span className="text-xs text-gray-700">{tgDetectResult.from}</span>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      Add <code className="font-mono text-amber-700">TELEGRAM_CHAT_ID=<span className="text-emerald-700">{tgDetectResult.chatId}</span></code> to env vars and redeploy.
                    </p>
                  </div>
                )}
                {tgTestMsg && tgDetect === 'error' && (
                  <p className="text-xs text-red-500">{tgTestMsg}</p>
                )}
              </div>
            )}

            {tgCfg !== null && !tgCfg.configured && !tgCfg.hasToken && (
              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs text-gray-400 text-center">
                Not set up yet — ask to get this configured.
              </div>
            )}

            {tgCfg === null && (
              <p className="text-xs text-gray-400 text-center">Checking status...</p>
            )}
          </div>
        </section>

        {/* ── LINE Notify ── */}
        <section>
          <SectionTitle>LINE Notify</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">

            {/* Status row */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">💬</span>
                <div>
                  <h3 className="font-bold text-gray-900">LINE Notify</h3>
                  <p className="text-xs text-gray-400 mt-0.5">New order alerts + daily revenue summary</p>
                </div>
              </div>
              {lineCfg !== null && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                  lineCfg.configured
                    ? 'bg-emerald-100 text-emerald-700'
                    : (lineCfg.hasToken || lineCfg.hasTargetId)
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {lineCfg.configured ? '✓ Active'
                    : (lineCfg.hasToken || lineCfg.hasTargetId) ? 'Partial'
                    : 'Not set'}
                </span>
              )}
            </div>

            {/* Config info (configured) */}
            {lineCfg?.configured && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Channel Token</span>
                  <code className="text-xs font-mono text-emerald-700">{lineCfg.tokenPreview}</code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Target ID</span>
                  <code className="text-xs font-mono text-emerald-700">{lineCfg.targetId}</code>
                </div>
              </div>
            )}

            {/* Partial config warning */}
            {lineCfg && !lineCfg.configured && (lineCfg.hasToken || lineCfg.hasTargetId) && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700 flex flex-col gap-1">
                <p className="font-semibold">Missing env vars:</p>
                {!lineCfg.hasToken    && <p>✗ LINE_CHANNEL_ACCESS_TOKEN</p>}
                {!lineCfg.hasTargetId && <p>✗ LINE_TARGET_ID</p>}
              </div>
            )}

            {/* Test Message + Daily Summary buttons */}
            {lineCfg?.configured && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={handleLineTest}
                    disabled={lineTest === 'loading'}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 ${
                      lineTest === 'done'    ? 'bg-emerald-500 text-white' :
                      lineTest === 'error'   ? 'bg-red-100 text-red-600 border border-red-200' :
                      lineTest === 'loading' ? 'bg-gray-200 text-gray-400 cursor-wait' :
                                               'bg-green-500 hover:bg-green-600 text-white'
                    }`}
                  >
                    {lineTest === 'loading' ? 'Sending...' :
                     lineTest === 'done'    ? '✓ Sent!' :
                     lineTest === 'error'   ? '✗ Failed' :
                                              '💬 Test Message'}
                  </button>
                  <button
                    onClick={handleLineDaily}
                    disabled={lineDaily === 'loading'}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 ${
                      lineDaily === 'done'    ? 'bg-emerald-500 text-white' :
                      lineDaily === 'error'   ? 'bg-red-100 text-red-600 border border-red-200' :
                      lineDaily === 'loading' ? 'bg-gray-200 text-gray-400 cursor-wait' :
                                                'bg-amber-500 hover:bg-amber-400 text-black'
                    }`}
                  >
                    {lineDaily === 'loading' ? 'Sending...' :
                     lineDaily === 'done'    ? '✓ Sent!' :
                     lineDaily === 'error'   ? '✗ Failed' :
                                               '📊 Daily Summary'}
                  </button>
                </div>
                {lineTestMsg && (
                  <p className={`text-xs px-1 ${lineTest === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
                    {lineTestMsg}
                  </p>
                )}
                {lineDailyMsg && (
                  <p className={`text-xs px-1 ${lineDaily === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
                    {lineDailyMsg}
                  </p>
                )}
              </div>
            )}

            {lineCfg !== null && !lineCfg.hasToken && !lineCfg.hasTargetId && (
              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs text-gray-400 text-center">
                Not set up yet — ask to get this configured.
              </div>
            )}

            {lineCfg === null && (
              <p className="text-xs text-gray-400 text-center">Checking status...</p>
            )}
          </div>
        </section>
        </>}

        {/* ── QR Self-Ordering ── */}
        {activeTab === 'qr' && <section>
          <SectionTitle>QR Self-Ordering</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-5 shadow-sm">

            {/* Config row */}
            <div className="flex flex-col gap-3">
              <p className="text-xs text-gray-500 leading-relaxed">
                Generate QR codes for each table. Customers scan → browse the menu → place their order directly to the kitchen.
              </p>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Base URL</label>
                <input
                  type="text"
                  value={qrBaseUrl}
                  onChange={e => setQrBaseUrl(e.target.value.trim().replace(/\/+$/, ''))}
                  placeholder="https://your-domain.com"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-amber-400 transition"
                />
                {qrBaseUrl.includes('localhost') || qrBaseUrl.includes('127.0.0.1') ? (
                  <p className="text-[11px] text-amber-600 leading-relaxed">
                    ⚠️ Base URL เป็น localhost — มือถือเครื่องอื่นสแกนแล้วจะเปิดไม่ได้ เพราะ &quot;localhost&quot; บนมือถือหมายถึงตัวมือถือเอง ไม่ใช่เครื่องนี้
                    ให้แก้เป็น IP เครื่องนี้ในวง LAN เดียวกัน (เช่น <code>http://192.168.1.50:3000</code>) หรือโดเมนจริงหลัง deploy
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-400">QR จะลิงก์ไปที่ {qrBaseUrl || '…'}/order/[tableNo]</p>
                )}
              </div>

              {/* Table source: real Floor Plan tiles — kept in sync via loadFloorTables() */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Tables from Floor Plan ({floorTables.length})
                  </label>
                  <div className="flex items-center gap-3">
                    {floorTables.length > 0 && (
                      <>
                        <button
                          onClick={() => setSelectedQrTables(new Set(floorTables))}
                          className="text-[11px] font-semibold text-amber-600 hover:text-amber-700"
                        >
                          Select all
                        </button>
                        <button
                          onClick={() => setSelectedQrTables(new Set())}
                          className="text-[11px] font-semibold text-gray-400 hover:text-gray-600"
                        >
                          Clear
                        </button>
                      </>
                    )}
                    <button
                      onClick={loadFloorTables}
                      className="text-[11px] font-semibold text-gray-400 hover:text-gray-600"
                    >
                      🔄 Refresh
                    </button>
                  </div>
                </div>

                {floorTables.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-100 rounded-xl py-6 text-center text-gray-300">
                    <p className="text-sm">ยังไม่มีโต๊ะในผังโต๊ะ (Floor Plan)</p>
                    <a href="/pos/floor" className="inline-block mt-2 text-xs font-bold text-amber-600 hover:text-amber-700">
                      ไปตั้งค่า Floor Plan →
                    </a>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 border border-gray-100 rounded-xl p-3 bg-gray-50 max-h-40 overflow-y-auto">
                    {floorTables.map(tableNo => {
                      const checked = selectedQrTables.has(tableNo)
                      return (
                        <button
                          key={tableNo}
                          onClick={() => toggleQrTable(tableNo)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono border transition active:scale-95 ${
                            checked
                              ? 'bg-amber-500 border-amber-500 text-black'
                              : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                          }`}
                        >
                          {checked ? '✓ ' : ''}{tableNo}
                        </button>
                      )
                    })}
                  </div>
                )}
                <p className="text-[11px] text-gray-400">
                  รายชื่อโต๊ะดึงมาจากผัง Floor Plan โดยตรง — เปลี่ยนชื่อ/เพิ่ม/ลบโต๊ะที่นั่น แล้วกด 🔄 Refresh
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={generateQRs}
                  disabled={qrLoading || selectedQrTables.size === 0}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 ${
                    qrLoading || selectedQrTables.size === 0
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-amber-500 hover:bg-amber-400 text-black'
                  }`}
                >
                  {qrLoading ? '⏳ Generating...' : `⚡ Generate QR Codes (${selectedQrTables.size})`}
                </button>
                {qrImages.length > 0 && (
                  <button
                    onClick={printQRSheet}
                    className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gray-900 hover:bg-gray-700 text-white transition active:scale-95"
                  >
                    🖨️ Print All
                  </button>
                )}
              </div>
            </div>

            {/* QR grid */}
            {qrImages.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {qrImages.map(({ tableNo, dataUrl }) => (
                  <div key={tableNo} className="flex flex-col items-center border border-gray-100 rounded-2xl p-3 gap-2 hover:border-amber-200 hover:bg-amber-50/30 transition">
                    <img src={dataUrl} alt={`QR for ${tableNo}`} className="w-full max-w-[120px] rounded-xl" />
                    <p className="text-sm font-black text-gray-900">Table {tableNo}</p>
                    <button
                      onClick={() => downloadQR(tableNo, dataUrl)}
                      className="w-full text-xs py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold transition active:scale-95"
                    >
                      ↓ Download
                    </button>
                  </div>
                ))}
              </div>
            )}

            {qrImages.length === 0 && (
              <div className="border-2 border-dashed border-gray-100 rounded-2xl py-8 text-center text-gray-300">
                <p className="text-3xl mb-2">📱</p>
                <p className="text-sm">Click Generate to create QR codes</p>
              </div>
            )}
          </div>
        </section>}

        {/* ── API & Webhooks (manager only) ── */}
        {activeTab === 'integrations' && isManager && (
          <section>
            <SectionTitle>API &amp; Webhooks</SectionTitle>
            <ApiWebhooksSection />
          </section>
        )}

        {/* ── System / Integrations ── */}
        {activeTab === 'integrations' && <section>
          <SectionTitle>System &amp; Integrations</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {SYSTEM_CARDS.map((card) => (
              <div key={card.title} className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-3xl">{card.icon}</span>
                  {card.badge && (
                    <span className="text-[10px] font-mono bg-gray-100 text-gray-500 rounded-lg px-2 py-1 text-right leading-tight max-w-[140px]">
                      {card.badge}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{card.title}</h3>
                  <p className="text-sm text-gray-500 mt-1 leading-snug">{card.description}</p>
                </div>
                {card.extra === 'qr-url' && (
                  <p className="text-[10px] text-gray-400 font-mono break-all">
                    {typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}/order/T1
                  </p>
                )}
                {card.badge === 'Coming soon' && (
                  <span className="text-xs text-amber-500 font-semibold">Coming next sprint</span>
                )}
              </div>
            ))}
          </div>
        </section>}

      </div>

      {/* Google account section */}
      {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
        <div className="px-6 pb-4 shrink-0">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Google Account</p>
          <OwnerProfileBadge />
        </div>
      )}

      <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400 shrink-0 flex items-center justify-between bg-white">
        <span>BAZE POS v1.0</span>
        <span>claude-sonnet-4-6</span>
      </div>
    </div>
  )
}
