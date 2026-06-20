'use client'

import { useState, useEffect, useRef } from 'react'
import {
  loadBarSettings, saveBarSettings,
  connectPrinter, disconnectPrinter, checkPrinterConnected,
  startScanPrinters,
  savePrinterDevice, loadPrinterDevice, clearPrinterDevice,
  printReceiptBluetooth, openCashDrawerBluetooth, isNativePlatform,
  type BarSettings, type PrinterDevice,
} from '@/lib/printer'

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

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  // Bar settings
  const [cfg, setCfg]         = useState<BarSettings | null>(null)
  const [cfgSaved, setCfgSaved] = useState(false)

  // Bluetooth printer state
  const [connected,    setConnected]    = useState(false)
  const [savedDevice,  setSavedDevice]  = useState<PrinterDevice | null>(null)
  const [btStatus,     setBtStatus]     = useState<'idle' | 'scanning' | 'connecting' | 'printing' | 'done' | 'error'>('idle')
  const [btError,      setBtError]      = useState('')
  const [scanResults,  setScanResults]  = useState<PrinterDevice[]>([])
  const [scanning,     setScanning]     = useState(false)
  const stopScanRef = useRef<(() => void) | null>(null)

  // Cash drawer (ผ่าน Bluetooth printer)
  const [drawerStatus, setDrawerStatus] = useState<'idle' | 'opening' | 'done' | 'error'>('idle')
  const [drawerError,  setDrawerError]  = useState('')

  const native = isNativePlatform()

  useEffect(() => {
    setCfg(loadBarSettings())
    // โหลดข้อมูล printer ที่บันทึกไว้ + ตรวจสอบว่า connected อยู่ไหม
    loadPrinterDevice().then(setSavedDevice).catch(() => {})
    checkPrinterConnected().then(setConnected).catch(() => {})

    return () => {
      // cleanup scan listener ถ้า component unmount ระหว่าง scan
      stopScanRef.current?.()
    }
  }, [])

  // ─── Cash Drawer (ผ่าน Bluetooth printer) ────────────────────────────────

  async function handleTestDrawer() {
    setDrawerStatus('opening')
    setDrawerError('')
    try {
      await openCashDrawerBluetooth()
      setDrawerStatus('done')
      setTimeout(() => setDrawerStatus('idle'), 3000)
    } catch (err) {
      setDrawerStatus('error')
      setDrawerError(err instanceof Error ? err.message : 'เปิด drawer ล้มเหลว')
      setTimeout(() => setDrawerStatus('idle'), 4000)
    }
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
    setTimeout(() => setCfgSaved(false), 2500)
  }

  // ─── Bluetooth Scan ───────────────────────────────────────────────────────

  async function handleStartScan() {
    setBtError('')
    setScanResults([])
    setScanning(true)
    setBtStatus('scanning')
    try {
      const stop = await startScanPrinters(
        (devices) => setScanResults(devices),
        ()        => setScanning(false),
      )
      stopScanRef.current = stop
      // หยุด scan อัตโนมัติหลัง 15 วินาที
      setTimeout(() => stop(), 15000)
    } catch (err) {
      setBtError(err instanceof Error ? err.message : 'Scan failed')
      setBtStatus('error')
      setScanning(false)
    }
  }

  function handleStopScan() {
    stopScanRef.current?.()
    setScanning(false)
    setBtStatus('idle')
  }

  // ─── Bluetooth Connect ────────────────────────────────────────────────────

  async function handleConnect(device: PrinterDevice) {
    setBtError('')
    setBtStatus('connecting')
    handleStopScan()
    try {
      const name = await connectPrinter(device.address)
      await savePrinterDevice(device.address, name)
      setSavedDevice({ address: device.address, name })
      setConnected(true)
      setBtStatus('idle')
    } catch (err) {
      setBtError(err instanceof Error ? err.message : 'Connection failed')
      setBtStatus('error')
      setConnected(false)
    }
  }

  // ─── Reconnect to saved printer ───────────────────────────────────────────

  async function handleReconnect() {
    if (!savedDevice) return
    setBtError('')
    setBtStatus('connecting')
    try {
      await connectPrinter(savedDevice.address)
      setConnected(true)
      setBtStatus('idle')
    } catch (err) {
      setBtError(err instanceof Error ? err.message : 'Reconnect failed')
      setBtStatus('error')
      setConnected(false)
    }
  }

  // ─── Disconnect ───────────────────────────────────────────────────────────

  async function handleDisconnect() {
    await disconnectPrinter()
    setConnected(false)
    setBtStatus('idle')
    setBtError('')
  }

  // ─── Forget printer ───────────────────────────────────────────────────────

  async function handleForget() {
    await disconnectPrinter()
    await clearPrinterDevice()
    setSavedDevice(null)
    setConnected(false)
    setScanResults([])
    setBtStatus('idle')
    setBtError('')
  }

  // ─── Test print ───────────────────────────────────────────────────────────

  async function handleTestPrint() {
    if (!cfg) return
    setBtError('')
    setBtStatus('printing')
    try {
      await printReceiptBluetooth({
        orderId: 'TEST001', tableNo: 'T1',
        createdAt: new Date().toISOString(),
        staffName: 'Admin', memberName: 'Test Member',
        couponCode: 'HAPPY10',
        items: [{ name: 'Mojito', qty: 2, price: 200 }, { name: 'Heineken', qty: 1, price: 80 }],
        subtotal: 480, discountAmount: 48, total: 432, vatIncluded: 28,
        paymentMethod: 'cash', received: 500, change: 68,
      }, cfg)
      setBtStatus('done')
      setTimeout(() => setBtStatus('idle'), 3000)
    } catch (err) {
      setBtError(err instanceof Error ? err.message : 'Print failed')
      setBtStatus('error')
    }
  }

  const btBusy = btStatus === 'connecting' || btStatus === 'printing' || btStatus === 'scanning'

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

  useEffect(() => {
    fetch('/api/sheets/setup').then(r => r.json()).then(setSheetsCfg).catch(() => {})
    fetch('/api/telegram').then(r => r.json()).then(setTgCfg).catch(() => {})
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

  const SYSTEM_CARDS = [
    {
      icon: '🤖',
      title: 'AI Model',
      description: 'Claude model used for analytics and smart suggestions.',
      badge: 'claude-sonnet-4-6',
    },
    {
      icon: '📱',
      title: 'Tilda Webhook',
      description: 'Endpoint URL for connecting Tilda online orders to POS.',
      badge: '/api/webhook/tilda',
      extra: 'webhook',
    },
  ]

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden bg-gray-50 text-gray-900"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-400 mt-0.5">Bar info, printer, and system configuration</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8 max-w-3xl">

        {/* ── Bar Information ── */}
        <section>
          <SectionTitle>Bar Information</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
            {cfg && (
              <>
                <SettingInput label="Bar Name" value={cfg.barName} onChange={v => updateCfg('barName', v)} placeholder="🍹 My Bar" />
                <SettingInput label="Address"  value={cfg.address} onChange={v => updateCfg('address', v)} placeholder="Sukhumvit Soi 11, Bangkok" />
                <SettingInput label="Phone"    value={cfg.phone}   onChange={v => updateCfg('phone', v)}   placeholder="02-xxx-xxxx" />
                <SettingInput label="Tax ID"   value={cfg.taxId}   onChange={v => updateCfg('taxId', v)}   placeholder="0-0000-00000-00-0" />

                <div className="flex items-start gap-4">
                  <label className="text-sm text-gray-500 w-24 shrink-0 pt-2.5">Footer</label>
                  <textarea
                    value={cfg.footer}
                    onChange={e => updateCfg('footer', e.target.value)}
                    rows={2}
                    placeholder={'ขอบคุณที่ใช้บริการ\nThank you!'}
                    className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400 transition resize-none"
                  />
                </div>

                <div className="flex items-center gap-4">
                  <label className="text-sm text-gray-500 w-24 shrink-0">Paper</label>
                  <div className="flex gap-2">
                    {([{ val: 32, label: '58mm' }, { val: 48, label: '80mm' }] as const).map(opt => (
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

                <div className="pt-1">
                  <button
                    onClick={saveCfg}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 ${
                      cfgSaved ? 'bg-emerald-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-black'
                    }`}
                  >
                    {cfgSaved ? '✓ Saved!' : 'Save Info'}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── Bluetooth Printer & Cash Drawer ── */}
        <section>
          <SectionTitle>Bluetooth Printer &amp; Cash Drawer</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">

            {/* Not native platform warning */}
            {!native && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 leading-relaxed">
                <p className="font-semibold mb-0.5">ℹ️ Browser Mode</p>
                <p>Bluetooth SPP ใช้งานได้เฉพาะใน Android APK (Capacitor) เท่านั้น — ไม่สามารถสแกนหรือเชื่อมต่อใน browser</p>
                <p className="mt-1 text-blue-500">Build Android APK ด้วย <code className="font-mono bg-blue-100 px-1 rounded">npx cap run android</code> เพื่อใช้งานจริง</p>
              </div>
            )}

            {/* Saved device status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${connected ? 'bg-emerald-400' : savedDevice ? 'bg-amber-400' : 'bg-gray-300'}`} />
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {connected
                      ? savedDevice?.name ?? 'Connected'
                      : savedDevice
                      ? savedDevice.name
                      : 'No printer configured'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {connected
                      ? '🟢 Connected · ' + (savedDevice?.address ?? '')
                      : savedDevice
                      ? '🔴 Saved · tap Reconnect to connect'
                      : 'Scan to find and pair a printer'}
                  </p>
                </div>
              </div>

              {/* Action button */}
              {connected ? (
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 text-gray-500 hover:bg-gray-100 transition"
                >
                  Disconnect
                </button>
              ) : savedDevice ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleReconnect}
                    disabled={btBusy}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white transition active:scale-95"
                  >
                    {btStatus === 'connecting' ? '...' : 'Reconnect'}
                  </button>
                  <button
                    onClick={handleForget}
                    className="px-3 py-2 rounded-xl text-xs font-semibold border border-red-100 text-red-400 hover:bg-red-50 transition"
                  >
                    Forget
                  </button>
                </div>
              ) : null}
            </div>

            {/* Scan button + results */}
            {!connected && (
              <div className="flex flex-col gap-3">
                {!scanning ? (
                  <button
                    onClick={handleStartScan}
                    disabled={btBusy}
                    className={`py-2.5 rounded-xl text-sm font-bold transition active:scale-95 ${
                      btBusy
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-500 hover:bg-blue-600 text-white active:scale-95'
                    }`}
                  >
                    🔍 Scan for Printers
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex items-center gap-2 py-2.5 px-4 bg-blue-50 border border-blue-100 rounded-xl">
                      <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
                      <span className="text-sm text-blue-700 font-medium">กำลังสแกน...</span>
                    </div>
                    <button
                      onClick={handleStopScan}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-500 hover:bg-gray-100 transition"
                    >
                      Stop
                    </button>
                  </div>
                )}

                {/* Device list */}
                {scanResults.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs text-gray-400 font-semibold px-1">พบ {scanResults.length} เครื่อง — เลือกเพื่อเชื่อมต่อ</p>
                    {scanResults.map(device => (
                      <button
                        key={device.address}
                        onClick={() => handleConnect(device)}
                        disabled={btBusy}
                        className="flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-amber-50 border border-gray-100 hover:border-amber-200 rounded-xl transition active:scale-[0.98]"
                      >
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

            {/* Test buttons (ใช้ได้เมื่อ connected) */}
            {connected && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  {/* Test print */}
                  <button
                    onClick={handleTestPrint}
                    disabled={btBusy}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition active:scale-95 ${
                      btStatus === 'done'    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                      btBusy                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                                              'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    {btStatus === 'printing' ? '⏳ Printing...' :
                     btStatus === 'done'     ? '✓ Printed!' :
                                               '🖨️ Test Print'}
                  </button>

                  {/* Test open cash drawer */}
                  <button
                    onClick={handleTestDrawer}
                    disabled={btBusy || drawerStatus === 'opening'}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition active:scale-95 ${
                      drawerStatus === 'done'    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                      drawerStatus === 'error'   ? 'bg-red-50 text-red-500 border border-red-100' :
                      drawerStatus === 'opening' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                                                   'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-100'
                    }`}
                  >
                    {drawerStatus === 'opening' ? '⏳ Opening...' :
                     drawerStatus === 'done'    ? '✓ Drawer Open!' :
                     drawerStatus === 'error'   ? '✗ Failed' :
                                                  '💰 Test Drawer'}
                  </button>
                </div>

                {/* Drawer error */}
                {drawerStatus === 'error' && drawerError && (
                  <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-xs text-red-600 leading-snug">
                    {drawerError}
                  </div>
                )}
              </div>
            )}

            {btError && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-600 leading-snug">
                {btError}
              </div>
            )}

            <p className="text-[11px] text-gray-400 leading-relaxed">
              Xprinter XP58 Bluetooth (SPP/Classic) — ต้องใช้ Android APK (Capacitor).
              Cash drawer เชื่อมต่อผ่าน RJ11/RJ12 port ของปริ้นเตอร์ — เปิดอัตโนมัติเมื่อรับเงินสด.
            </p>
          </div>
        </section>

        {/* ── Google Sheets ── */}
        <section>
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

            {sheetsCfg !== null && !sheetsCfg.configured && (
              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs text-gray-500 leading-relaxed flex flex-col gap-1.5">
                <p className="font-semibold text-gray-700">How to connect:</p>
                <p>1. Create a Google Sheet and copy the ID from the URL</p>
                <p>2. Create a Service Account in Google Cloud Console</p>
                <p>3. Share the sheet with the service account email</p>
                <p>4. Add to Railway env vars: <code className="font-mono text-amber-700">GOOGLE_SHEETS_SERVICE_ACCOUNT</code> + <code className="font-mono text-amber-700">GOOGLE_SHEET_ID</code></p>
                <p>5. Redeploy, then click <strong>Setup Headers</strong></p>
              </div>
            )}
          </div>
        </section>

        {/* ── Telegram Bot ── */}
        <section>
          <SectionTitle>Telegram Bot Notifications</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">

            {/* Status row */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">✈️</span>
                <div>
                  <h3 className="font-bold text-gray-900">Siam Amsterdam POS Bot</h3>
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

            {/* Setup instructions (only when no token set) */}
            {tgCfg !== null && !tgCfg.configured && !tgCfg.hasToken && (
              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs text-gray-500 leading-relaxed flex flex-col gap-1.5">
                <p className="font-semibold text-gray-700">How to set up Telegram Bot:</p>
                <p>1. Open Telegram → search <code className="font-mono bg-gray-100 text-blue-700 px-1 rounded">@BotFather</code></p>
                <p>2. Send <code className="font-mono bg-gray-100 text-blue-700 px-1 rounded">/newbot</code> → name: <strong>Siam Amsterdam POS</strong> → username: <strong>siamamsterdampos_bot</strong></p>
                <p>3. Copy the <strong>Bot Token</strong> → add to env vars:</p>
                <code className="block bg-gray-100 text-amber-700 px-2 py-1.5 rounded font-mono text-[10px]">TELEGRAM_BOT_TOKEN=1234567890:ABCdef...</code>
                <p>4. Send any message to the Bot → click <strong>Detect Chat ID</strong></p>
                <p>5. Add <code className="font-mono bg-gray-100 text-amber-700 px-1 rounded">TELEGRAM_CHAT_ID</code> → Redeploy → test with Test Message</p>
              </div>
            )}

            {tgCfg === null && (
              <p className="text-xs text-gray-400 text-center">Checking status...</p>
            )}
          </div>
        </section>

        {/* ── System / Integrations ── */}
        <section>
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
                {card.extra === 'webhook' && (
                  <p className="text-[10px] text-gray-400 font-mono break-all">
                    {typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}/api/webhook/tilda
                  </p>
                )}
                {card.badge === 'Coming soon' && (
                  <span className="text-xs text-amber-500 font-semibold">Coming next sprint</span>
                )}
              </div>
            ))}
          </div>
        </section>

      </div>

      <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400 shrink-0 flex items-center justify-between bg-white">
        <span>BAR POS v1.0</span>
        <span>claude-sonnet-4-6</span>
      </div>
    </div>
  )
}
