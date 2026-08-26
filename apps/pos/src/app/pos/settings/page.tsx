'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { useAuth } from '@/lib/pos-auth'
import { authedFetch } from '@/lib/supabase-browser'
import {
  loadBarSettings, saveBarSettings,
  loadPrinterDevice, clearPrinterDevice,
  printReceipt, openCashDrawer, isNativePlatform,
  type BarSettings, type PrinterDevice, type ReceiptTemplate,
} from '@/lib/printer'
import { pushBarSettings } from '@/lib/settings-sync'
import { useBluetooth, bluetoothManager } from '@/lib/bluetooth-manager'
import { OwnerProfileBadge } from '@/components/pos/GoogleAuthGuard'
import { AI_NAME, APP_VERSION } from '@/lib/ai-brand'
import { usePosLang, POS_LANGS, type PosStringKey } from '@/lib/pos-i18n'
import PosIcon from '@/components/pos/PosIcon'
import {
  DELIVERY_CHANNELS, CHANNEL_KEYS,
  loadDeliverySettings, saveDeliverySettings, type DeliverySettings,
} from '@/lib/delivery'
import type { DeliveryChannel } from '@/lib/types'

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
  const { t: tr } = usePosLang()
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
      const r = await authedFetch('/api/payment/config')
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
      const r = await authedFetch('/api/payment/config', {
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

  if (loading) return <p className="text-sm text-gray-400">{tr('loading')}</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-gray-500">{tr('payAcceptDesc')}</p>
        {typedMode && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            typedMode === 'live' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {typedMode === 'live' ? tr('payLiveMode') : tr('payTestMode')}
          </span>
        )}
      </div>

      {fromEnv && (
        <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
          {tr('payEnvOverride')}
        </p>
      )}

      <div>
        <label className="text-xs text-gray-500 mb-1 block">{tr('setPublishableKey')}</label>
        <input
          value={publicKey}
          onChange={e => setPublicKey(e.target.value)}
          placeholder="pkey_test_xxxxxxxxxxxxxxxx"
          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400 transition"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">
          {tr('paySecretLabel')}
          {secretSet && <span className="text-emerald-600 font-semibold ml-2">✓ {tr('paySecretSet')} ••••{secretLast4}</span>}
        </label>
        <input
          type="password"
          value={secretKey}
          onChange={e => setSecretKey(e.target.value)}
          placeholder={secretSet ? tr('paySecretReplace') : 'skey_test_xxxxxxxxxxxxxxxx'}
          autoComplete="off"
          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400 transition"
        />
        <p className="text-[11px] text-gray-400 mt-1">{tr('paySecretStored')}</p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-gray-900 text-white font-bold text-sm transition active:scale-95 disabled:opacity-50"
        >
          {saving ? tr('saving') : saved ? '✓ ' + tr('saved') : tr('paySaveKeys')}
        </button>
      </div>
    </div>
  )
}

// ─── Bank-transfer / PromptPay-slip sub-component ─────────────────────────────
// For stores without Omise: accept transfers to a personal PromptPay account and
// verify the customer's slip — automatically (SlipOK) or by staff confirmation.

function TransferSettings() {
  const { t: tr } = usePosLang()
  const [enabled, setEnabled]         = useState(false)
  const [mode, setMode]               = useState<'auto' | 'manual'>('manual')
  const [promptpayId, setPromptpayId] = useState('')
  const [accountName, setAccountName] = useState('')
  const [slipokKey, setSlipokKey]     = useState('')          // only sent if newly typed
  const [slipokSet, setSlipokSet]     = useState(false)
  const [branchId, setBranchId]       = useState('')
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState('')
  const [testMsg, setTestMsg]         = useState('')

  const load = useCallback(async () => {
    try {
      const r = await authedFetch('/api/payment/config')
      const d = await r.json()
      const t = d.transfer ?? {}
      setEnabled(!!t.enabled)
      setMode(t.mode === 'auto' ? 'auto' : 'manual')
      setPromptpayId(t.promptpayId ?? '')
      setAccountName(t.accountName ?? '')
      setSlipokSet(!!d.transferAdmin?.slipokConfigured)
      setBranchId(d.transferAdmin?.slipokBranchId ?? '')
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const transfer: Record<string, unknown> = {
        enabled, mode, promptpayId: promptpayId.trim(), accountName: accountName.trim(),
        slipokBranchId: branchId.trim(),
      }
      if (slipokKey.trim()) transfer.slipokApiKey = slipokKey.trim()   // don't wipe unless replaced
      const r = await authedFetch('/api/payment/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transfer }),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'Save failed')
      setSlipokKey('')
      await load()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // "ทดสอบ" — send a harmless sample payload through the verify pipeline. A
  // configured auto store gets a real SlipOK round-trip (expected to reject the
  // dummy); manual mode / no key degrades to pending. Either proves the wiring.
  async function test() {
    setTestMsg('กำลังทดสอบ…')
    try {
      const r = await authedFetch('/api/payment/slip/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: '00000000-0000-0000-0000-000000000000', qrPayload: '00020101' }),
      })
      const d = await r.json().catch(() => ({}))
      // A 404 (dummy order) still proves auth + config resolved correctly.
      setTestMsg(r.status === 404
        ? '✓ การตั้งค่าใช้งานได้ (order ทดสอบไม่มีอยู่จริง ตามคาด)'
        : d.error ? `ผล: ${d.error}` : `ผล: ${d.status ?? r.status}`)
    } catch {
      setTestMsg('✗ เชื่อมต่อไม่สำเร็จ')
    }
  }

  if (loading) return <p className="text-sm text-gray-400">{tr('loading')}</p>

  const inputCls = 'w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400 transition'

  return (
    <div className="flex flex-col gap-4 mt-8 pt-6 border-t border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-sm text-gray-800">โอนเงิน / PromptPay (สลิป)</p>
          <p className="text-xs text-gray-400 mt-0.5">รับโอนเข้าบัญชีส่วนตัว แล้วตรวจสลิปอัตโนมัติหรือให้พนักงานยืนยัน</p>
        </div>
        <button
          onClick={() => setEnabled(v => !v)}
          className={`shrink-0 w-12 h-7 rounded-full transition relative ${enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
          aria-pressed={enabled}
        >
          <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>

      {enabled && (
        <>
          {/* Mode */}
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: 'manual', label: 'พนักงานยืนยัน', desc: 'พนักงานดูสลิปแล้วกดยืนยัน' },
              { id: 'auto',   label: 'ตรวจอัตโนมัติ',  desc: 'ตรวจสลิปผ่าน SlipOK' },
            ] as const).map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`text-left p-3 rounded-xl border-2 transition ${
                  mode === m.id ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <p className="font-bold text-sm text-gray-800">{m.label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{m.desc}</p>
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">PromptPay (เบอร์โทร / เลขบัตร ปชช. / e-Wallet)</label>
            <input value={promptpayId} onChange={e => setPromptpayId(e.target.value)} placeholder="0812345678" className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">ชื่อบัญชีผู้รับ</label>
            <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="นาย…" className={inputCls} />
          </div>

          {mode === 'auto' && (
            <div className="flex flex-col gap-3 bg-gray-50 border border-gray-100 rounded-xl p-3">
              <p className="text-[11px] text-gray-500">
                ตรวจสลิปอัตโนมัติผ่าน SlipOK — ต้องสมัครที่ slipok.com เพื่อรับ API key + Branch ID
                (ถ้ายังไม่ตั้งค่าหรือเครดิตหมด ระบบจะเปลี่ยนเป็นให้พนักงานยืนยันแทน)
              </p>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  SlipOK API Key
                  {slipokSet && <span className="text-emerald-600 font-semibold ml-2">✓ ตั้งค่าแล้ว</span>}
                </label>
                <input type="password" value={slipokKey} onChange={e => setSlipokKey(e.target.value)}
                  placeholder={slipokSet ? 'พิมพ์ใหม่เพื่อแทนที่' : 'SLIPOK…'} autoComplete="off" className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">SlipOK Branch ID</label>
                <input value={branchId} onChange={e => setBranchId(e.target.value)} placeholder="เช่น 12345" className={inputCls} />
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
      {testMsg && <p className="text-xs text-gray-500">{testMsg}</p>}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-gray-900 text-white font-bold text-sm transition active:scale-95 disabled:opacity-50">
          {saving ? tr('saving') : saved ? '✓ ' + tr('saved') : tr('paySaveKeys')}
        </button>
        {enabled && (
          <button onClick={test}
            className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-bold text-sm transition active:scale-95 hover:bg-gray-50">
            ทดสอบ
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

// ─── Delivery settings (moved here from the staff-facing delivery board so ──────
//     partner API secrets stay behind the manager-only Settings gate) ────────────

type GrabApiConfig = {
  clientIdConfigured: boolean
  clientIdLast4: string | null
  clientSecretConfigured: boolean
  merchantId: string
  webhookSecretConfigured: boolean
  autoAccept: boolean
  commission: string
}

function DeliverySettingsSection() {
  const { t: tr } = usePosLang()
  const [rates, setRates] = useState<Record<DeliveryChannel, string>>(() => {
    const s = loadDeliverySettings()
    return {
      grab:       (s.commission.grab * 100).toFixed(0),
      lineman:    (s.commission.lineman * 100).toFixed(0),
      shopeefood: (s.commission.shopeefood * 100).toFixed(0),
    }
  })
  const [grabCfg, setGrabCfg]         = useState<GrabApiConfig | null>(null)
  const [grabClientId, setClientId]   = useState('')
  const [grabSecret, setGrabSecret]   = useState('')
  const [grabMerchant, setMerchant]   = useState('')
  const [grabWebhookSecret, setWhSecret] = useState('')
  const [grabAutoAccept, setAutoAccept]  = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    authedFetch('/api/delivery/config')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.grab) return
        setGrabCfg(d.grab)
        setMerchant(d.grab.merchantId ?? '')
        setAutoAccept(!!d.grab.autoAccept)
      })
      .catch(() => {})
  }, [])

  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/delivery/webhooks/grab` : ''
  const grabConnected = !!(grabCfg?.clientIdConfigured && grabCfg?.clientSecretConfigured && grabCfg?.merchantId)

  async function save() {
    setSaving(true); setSaved(false)
    const current = loadDeliverySettings()
    const commission = { ...current.commission }
    for (const key of CHANNEL_KEYS) {
      const v = Number(rates[key])
      if (Number.isFinite(v) && v >= 0 && v <= 100) commission[key] = v / 100
    }
    saveDeliverySettings({ commission })

    // Persist Grab config server-side; secrets only when a new value was typed
    const grab: Record<string, unknown> = {
      merchantId: grabMerchant,
      autoAccept: grabAutoAccept,
      commission: (commission.grab * 100).toFixed(0),
    }
    if (grabClientId.trim())      grab.clientId = grabClientId
    if (grabSecret.trim())        grab.clientSecret = grabSecret
    if (grabWebhookSecret.trim()) grab.webhookSecret = grabWebhookSecret
    try {
      await authedFetch('/api/delivery/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grab }),
      })
    } catch { /* ignore — commission rates already saved locally */ }
    setSaving(false)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
      {/* Commission rates */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{tr('dsCommissionRates')}</p>
        <p className="text-gray-400 text-xs mb-3">{tr('dsCommissionNote')}</p>
        <div className="flex flex-col gap-2">
          {CHANNEL_KEYS.map(key => (
            <label key={key} className="flex items-center gap-3">
              <span className="text-gray-700 text-sm flex-1">{DELIVERY_CHANNELS[key].label}</span>
              <input
                value={rates[key]}
                onChange={e => setRates(prev => ({ ...prev, [key]: e.target.value }))}
                inputMode="numeric"
                className="w-20 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 text-right focus:outline-none focus:border-amber-400"
              />
              <span className="text-gray-400 text-sm">%</span>
            </label>
          ))}
        </div>
      </div>

      {/* Grab partner API */}
      <div className="border-t border-gray-100 pt-3">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{tr('dsGrabApi')}</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${grabConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
            {grabConnected ? tr('dsConfigured') : tr('dsNotConfigured')}
          </span>
        </div>
        <p className="text-gray-400 text-xs mb-3">{tr('dsGrabNote')}</p>
        <div className="flex flex-col gap-2">
          <input
            value={grabClientId}
            onChange={e => setClientId(e.target.value)}
            placeholder={grabCfg?.clientIdConfigured ? `${tr('dsClientId')} (···${grabCfg.clientIdLast4}) — ${tr('dsSavedReplace')}` : tr('dsClientId')}
            className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400"
          />
          <input
            value={grabSecret}
            onChange={e => setGrabSecret(e.target.value)}
            type="password"
            placeholder={grabCfg?.clientSecretConfigured ? `${tr('dsClientSecret')} — ${tr('dsSavedReplace')}` : tr('dsClientSecret')}
            className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400"
          />
          <input
            value={grabMerchant}
            onChange={e => setMerchant(e.target.value)}
            placeholder={tr('dsMerchantId')}
            className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400"
          />
          <input
            value={grabWebhookSecret}
            onChange={e => setWhSecret(e.target.value)}
            type="password"
            placeholder={grabCfg?.webhookSecretConfigured ? `${tr('dsWebhookSecret')} — ${tr('dsSavedReplace')}` : tr('dsWebhookSecretHint')}
            className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700 py-1">
            <input type="checkbox" checked={grabAutoAccept} onChange={e => setAutoAccept(e.target.checked)} className="accent-green-500 w-4 h-4" />
            {tr('dsAutoAccept')}
          </label>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
            <span className="text-[11px] text-gray-400 font-mono truncate flex-1">{webhookUrl}</span>
            <button
              onClick={() => { navigator.clipboard?.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
              className="text-[11px] text-gray-500 hover:text-gray-900 font-bold shrink-0"
            >
              {copied ? `✓ ${tr('dsCopied')}` : tr('dsCopy')}
            </button>
          </div>
          <p className="text-[10px] text-gray-400">{tr('dsWebhookRegister')}</p>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className={`px-6 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 self-start ${
          saved ? 'bg-emerald-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-black'
        } disabled:opacity-40`}
      >
        {saving ? tr('dsSaving') : saved ? `✓ ${tr('savedBang')}` : tr('saveChanges')}
      </button>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type TabKey = 'general' | 'printer' | 'qr' | 'notify' | 'payment' | 'integrations'

const TABS: { key: TabKey; icon: string; labelKey: PosStringKey }[] = [
  { key: 'general',      icon: '/pos-icons/settings.png',        labelKey: 'setTabGeneral' },
  { key: 'printer',      icon: '/pos-icons/receipt-printer.png', labelKey: 'setTabPrinter' },
  { key: 'qr',           icon: '/pos-icons/qr-ordering.png',     labelKey: 'setTabQr' },
  { key: 'notify',       icon: '/pos-icons/alert.png',           labelKey: 'setTabNotify' },
  { key: 'payment',      icon: '/pos-icons/credit-card.png',     labelKey: 'setTabPayment' },
  { key: 'integrations', icon: '/pos-icons/integration.png',     labelKey: 'setTabIntegrations' },
]

export default function SettingsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const role = user?.role ?? ''
  const isManager = ['admin', 'manager'].includes(role)
  const isAdmin   = role === 'admin'   // Owner-only — gates the secret sections
  const { t: tr, lang, setLang } = usePosLang()

  // Page-level guard: Settings is manager+ only. Hiding the nav link isn't
  // access control — a bartender/staff hitting /pos/settings directly must be
  // bounced. `user` is null for a beat during hydration, so only redirect once
  // a role is known and it isn't manager+.
  useEffect(() => {
    if (role && !isManager) router.replace('/pos')
  }, [role, isManager, router])

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
    // If the server hydration lands after this page has mounted, re-read the
    // freshly-cached settings so the form shows the persisted values.
    const onHydrated = () => setCfg(loadBarSettings())
    window.addEventListener('pos-settings-changed', onHydrated)
    return () => {
      bluetoothManager.stopScan()
      window.removeEventListener('pos-settings-changed', onHydrated)
    }
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
      const r = await authedFetch('/api/printer/send', {
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
        setLanTestMsg(data.error ?? tr('toastConnectionFail'))
      }
    } catch (err) {
      setLanTestStatus('error')
      setLanTestMsg(err instanceof Error ? err.message : tr('toastNetworkError'))
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
    saveBarSettings(cfg)   // local cache (synchronous)
    setCfgSaved(true)
    window.dispatchEvent(new CustomEvent('pos-settings-changed'))
    setTimeout(() => setCfgSaved(false), 2500)
    // Persist server-side so a reinstall/new device keeps it. Warn if the server
    // rejected the write (e.g. not signed in as admin) instead of silently
    // leaving it device-only.
    pushBarSettings(cfg).then(ok => {
      if (!ok) alert(tr('saveServerFailed'))
    })
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
      setLocalError(err instanceof Error ? err.message : tr('toastPrintFailed'))
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
    authedFetch('/api/sheets/setup').then(r => r.json()).then(setSheetsCfg).catch(() => {})
    authedFetch('/api/telegram').then(r => r.json()).then(setTgCfg).catch(() => {})
    authedFetch('/api/line').then(r => r.json()).then(setLineCfg).catch(() => {})
  }, [])

  async function handleSheetsSetup() {
    setSheetsSetup('loading')
    setSheetsMsg('')
    try {
      const r    = await authedFetch('/api/sheets/setup', { method: 'POST' })
      const data = await r.json()
      setSheetsMsg(data.message ?? (r.ok ? tr('toastDone') : tr('toastError')))
      setSheetsSetup(r.ok ? 'done' : 'error')
      setTimeout(() => setSheetsSetup('idle'), 5000)
    } catch (err) {
      setSheetsMsg(err instanceof Error ? err.message : tr('toastNetworkError'))
      setSheetsSetup('error')
      setTimeout(() => setSheetsSetup('idle'), 5000)
    }
  }

  // ─── Telegram ─────────────────────────────────────────────────────────────

  async function handleTgTest() {
    setTgTest('loading')
    setTgTestMsg('')
    try {
      const r    = await authedFetch('/api/telegram', { method: 'POST' })
      const data = await r.json()
      setTgTestMsg(data.error ?? (r.ok ? tr('toastSentTelegram') : tr('toastFailedSend')))
      setTgTest(r.ok ? 'done' : 'error')
      if (r.ok) authedFetch('/api/telegram').then(r2 => r2.json()).then(setTgCfg).catch(() => {})
      setTimeout(() => setTgTest('idle'), 5000)
    } catch (err) {
      setTgTestMsg(err instanceof Error ? err.message : tr('toastNetworkError'))
      setTgTest('error')
      setTimeout(() => setTgTest('idle'), 5000)
    }
  }

  async function handleTgDaily() {
    setTgDaily('loading')
    setTgDailyMsg('')
    try {
      const r    = await authedFetch('/api/telegram/daily', { method: 'POST' })
      const data = await r.json()
      setTgDailyMsg(data.error ?? (r.ok ? `Sent! ${data.orders} orders · ฿${(data.revenue ?? 0).toLocaleString()}` : tr('toastFailedSend')))
      setTgDaily(r.ok ? 'done' : 'error')
      setTimeout(() => setTgDaily('idle'), 6000)
    } catch (err) {
      setTgDailyMsg(err instanceof Error ? err.message : tr('toastNetworkError'))
      setTgDaily('error')
      setTimeout(() => setTgDaily('idle'), 5000)
    }
  }

  async function handleTgDetect() {
    setTgDetect('loading')
    setTgDetectResult(null)
    setTgTestMsg('')
    try {
      const r    = await authedFetch('/api/telegram/setup')
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
      setTgTestMsg(err instanceof Error ? err.message : tr('toastNetworkError'))
      setTgDetect('error')
      setTimeout(() => setTgDetect('idle'), 5000)
    }
  }

  // ─── LINE Notify ──────────────────────────────────────────────────────────

  async function handleLineTest() {
    setLineTest('loading')
    setLineTestMsg('')
    try {
      const r    = await authedFetch('/api/line', { method: 'POST' })
      const data = await r.json()
      setLineTestMsg(data.error ?? (r.ok ? tr('toastSentLine') : tr('toastFailedSend')))
      setLineTest(r.ok ? 'done' : 'error')
      setTimeout(() => setLineTest('idle'), 5000)
    } catch (err) {
      setLineTestMsg(err instanceof Error ? err.message : tr('toastNetworkError'))
      setLineTest('error')
      setTimeout(() => setLineTest('idle'), 5000)
    }
  }

  async function handleLineDaily() {
    setLineDaily('loading')
    setLineDailyMsg('')
    try {
      const r    = await authedFetch('/api/line/daily', { method: 'POST' })
      const data = await r.json()
      setLineDailyMsg(data.error ?? (r.ok ? `Sent! ${data.orders} orders · ฿${(data.revenue ?? 0).toLocaleString()}` : tr('toastFailedSend')))
      setLineDaily(r.ok ? 'done' : 'error')
      setTimeout(() => setLineDaily('idle'), 6000)
    } catch (err) {
      setLineDailyMsg(err instanceof Error ? err.message : tr('toastNetworkError'))
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
  const [qrAutoPrint, setQrAutoPrint] = useState(true)  // auto-print incoming QR orders on THIS device
  const [memberQr,    setMemberQr]    = useState('')    // QR image for the member sign-up link
  const [reserveQr,   setReserveQr]   = useState('')    // QR image for the table-reservation link
  const [reserveCopied, setReserveCopied] = useState(false)
  const [linkCopied,  setLinkCopied]  = useState(false)
  const [benefits,    setBenefits]    = useState<{ icon: string; text: string }[]>([])
  const [benefitsSaved, setBenefitsSaved] = useState(false)
  const [storeSlug,   setStoreSlug]   = useState('')   // this venue's store — the QR link is /order/{slug}/{table}
  const [qrImages,    setQrImages]    = useState<{ tableNo: string; dataUrl: string }[]>([])
  const [qrLoading,   setQrLoading]   = useState(false)
  const [floorTables, setFloorTables] = useState<string[]>([])
  const [selectedQrTables, setSelectedQrTables] = useState<Set<string>>(new Set())

  // ตั้งค่าเริ่มต้นหลัง mount เท่านั้น — กัน hydration mismatch (window ไม่มีฝั่ง server)
  // ค่าเริ่มต้นคือ origin ปัจจุบัน ซึ่งตอน dev local จะเป็น localhost — ใช้ไม่ได้ถ้าสแกนจากมือถือ
  // เครื่องอื่น ต้องแก้เป็น LAN IP ของเครื่องนี้ (เช่น http://192.168.1.50:3000) หรือโดเมนจริงตอน deploy
  useEffect(() => {
    setQrBaseUrl(window.location.origin)
    try { setQrAutoPrint(localStorage.getItem('pos_qr_autoprint') !== 'off') } catch { /* ignore */ }
    // Resolve this venue's store slug for the customer QR link.
    authedFetch('/api/store')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.store) setStoreSlug(d.store.slug || d.store.id) })
      .catch(() => {})
    authedFetch('/api/member-benefits')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d?.benefits)) setBenefits(d.benefits) })
      .catch(() => {})
  }, [])

  function addBenefit()               { setBenefits(b => [...b, { icon: '⭐', text: '' }]); setBenefitsSaved(false) }
  function removeBenefit(i: number)   { setBenefits(b => b.filter((_, j) => j !== i)); setBenefitsSaved(false) }
  function updateBenefit(i: number, field: 'icon' | 'text', val: string) {
    setBenefits(b => b.map((x, j) => j === i ? { ...x, [field]: val } : x)); setBenefitsSaved(false)
  }
  async function saveBenefits() {
    const clean = benefits.map(b => ({ icon: b.icon || '⭐', text: b.text.trim() })).filter(b => b.text)
    try {
      const r = await authedFetch('/api/member-benefits', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ benefits: clean }),
      })
      if (r.ok) { setBenefits((await r.json()).benefits ?? clean); setBenefitsSaved(true); setTimeout(() => setBenefitsSaved(false), 2500) }
      else alert(tr('saveServerFailed'))
    } catch { alert(tr('saveServerFailed')) }
  }

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

  // Build + render the member sign-up link QR whenever the store/base is known.
  const memberSignupUrl = `${qrBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')}/register/${storeSlug}`
  useEffect(() => {
    if (!storeSlug) { setMemberQr(''); return }
    QRCode.toDataURL(memberSignupUrl, { width: 300, margin: 2, color: { dark: '#111111', light: '#FFFFFF' } })
      .then(setMemberQr).catch(() => setMemberQr(''))
  }, [memberSignupUrl, storeSlug])

  function copyMemberLink() {
    try {
      navigator.clipboard?.writeText(memberSignupUrl)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1800)
    } catch { /* ignore */ }
  }

  // ── Table-reservation link + QR (customers scan to book) ──
  const reserveUrl = `${qrBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')}/reserve/${storeSlug}`
  useEffect(() => {
    if (!storeSlug) { setReserveQr(''); return }
    QRCode.toDataURL(reserveUrl, { width: 300, margin: 2, color: { dark: '#111111', light: '#FFFFFF' } })
      .then(setReserveQr).catch(() => setReserveQr(''))
  }, [reserveUrl, storeSlug])

  function copyReserveLink() {
    try {
      navigator.clipboard?.writeText(reserveUrl)
      setReserveCopied(true)
      setTimeout(() => setReserveCopied(false), 1800)
    } catch { /* ignore */ }
  }

  // Open a ready-to-print A4 poster ("สแกนเพื่อจองโต๊ะ") for the shopfront / social.
  async function printReservePoster() {
    if (!storeSlug) return
    const qr = await QRCode.toDataURL(reserveUrl, {
      width: 1000, margin: 1, errorCorrectionLevel: 'H', color: { dark: '#1B1712', light: '#FFFFFF' },
    }).catch(() => '')
    const name = (cfg?.barName || 'SIAM AMSTERDAM').toUpperCase()
    const win = window.open('', '_blank', 'width=800,height=1000')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>Reservation Poster — ${name}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,500&family=Kanit:wght@300;500;700&display=swap">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{height:100%}
  body{font-family:"Kanit",system-ui,sans-serif;background:#140F0A;color:#F7F0E4;display:flex;align-items:center;justify-content:center;padding:20px}
  .p{width:100%;max-width:520px;aspect-ratio:210/297;position:relative;overflow:hidden;border-radius:20px;
     background:radial-gradient(78% 46% at 50% 40%,rgba(245,163,16,.16),transparent 62%),#140F0A;border:1px solid #3A2E20;
     display:flex;flex-direction:column;padding:38px 34px 30px;text-align:center}
  .kick{color:#F5A310;font-size:12px;letter-spacing:.4em;text-transform:uppercase;font-weight:500}
  .name{font-family:"Fraunces",serif;font-weight:600;font-size:38px;line-height:1;margin-top:10px}
  .sub{color:#B39A7C;font-size:11px;letter-spacing:.3em;text-transform:uppercase;margin-top:8px}
  .cta{font-weight:700;font-size:46px;line-height:1.02;margin-top:auto;background:linear-gradient(180deg,#F7F0E4 30%,#F2D6A6);-webkit-background-clip:text;background-clip:text;color:transparent}
  .en{font-family:"Fraunces",serif;font-style:italic;color:#FBC24B;font-size:19px;margin-top:6px}
  .ru{color:#B39A7C;font-size:12px;font-weight:300;margin-top:2px}
  .qr{width:210px;margin:22px auto 0;background:#FCFAF4;border-radius:18px;padding:14px}
  .qr img{width:100%;display:block}
  .url{margin:14px auto 0;width:max-content;max-width:100%;font-size:12px;border:1px solid #3A2E20;border-radius:999px;padding:7px 15px}
  .url b{color:#F5A310}
  .foot{margin-top:auto;padding-top:18px;border-top:1px solid #3A2E20;color:#B39A7C;font-size:11px;letter-spacing:.14em;text-transform:uppercase}
  .foot b{color:#F5A310;margin:0 6px}
  @page{size:210mm 297mm;margin:0}
  @media print{body{padding:0;background:#140F0A}.p{max-width:none;width:100%;height:100vh;aspect-ratio:auto;border:0;border-radius:0}}
</style></head><body>
  <div class="p">
    <div><div class="kick">Reservations</div><div class="name">${name}</div><div class="sub">จองโต๊ะ · จองอีเวนต์ · Booking</div></div>
    <div class="cta">สแกนเพื่อ<br>จองโต๊ะ</div>
    <div class="en">Scan to book a table</div>
    <div class="ru">Отсканируйте, чтобы забронировать столик</div>
    <div class="qr"><img src="${qr}" alt="QR"></div>
    <div class="url">${reserveUrl.replace(/^https?:\/\//,'')}</div>
    <div class="foot">Cocktails<b>•</b>Events<b>•</b>Good times</div>
  </div>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print()},600)})<\/script>
</body></html>`)
    win.document.close()
    win.focus()
  }

  function toggleQrAutoPrint() {
    setQrAutoPrint(v => {
      const nv = !v
      try { localStorage.setItem('pos_qr_autoprint', nv ? 'on' : 'off') } catch { /* ignore */ }
      return nv
    })
  }

  const generateQRs = useCallback(async () => {
    const tableNos = floorTables.filter(t => selectedQrTables.has(t))
    if (!tableNos.length) return
    setQrLoading(true)
    const base = qrBaseUrl || window.location.origin
    const results: { tableNo: string; dataUrl: string }[] = []
    for (const tableNo of tableNos) {
      const url     = `${base}/order/${storeSlug}/${tableNo}`
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: '#111111', light: '#FFFFFF' } })
      results.push({ tableNo, dataUrl })
    }
    setQrImages(results)
    setQrLoading(false)
  }, [floorTables, selectedQrTables, qrBaseUrl, storeSlug])

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
        <p style="margin:0;font-size:9px;color:#888;font-family:monospace;word-break:break-all;text-align:center">${base}/order/${storeSlug}/${tableNo}</p>
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
      title: 'AI Model',
      description: 'BAZE AI engine used for analytics and smart suggestions (powered by Claude).',
      badge: AI_NAME,
    },
    {
      title: 'QR Self-Order',
      description: 'Customer-facing order page URL. Print as QR code for each table.',
      badge: '/order/[store]/[tableNo]',
      extra: 'qr-url',
    },
  ]

  // Block render for non-managers (the redirect above is in flight).
  if (role && !isManager) return null

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden bg-gray-50 text-gray-900"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">{tr('navSettings')}</h1>
        <p className="text-sm text-gray-400 mt-0.5">Business info, receipt, printer, and system configuration</p>
      </div>

      {/* Tab nav — the Payment tab (Omise secret keys) is owner-only */}
      <div className="px-6 border-b border-gray-200 bg-white shrink-0 flex gap-1 overflow-x-auto">
        {TABS.filter(tab => tab.key !== 'payment' || isAdmin).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition inline-flex items-center gap-1.5 ${
              activeTab === tab.key
                ? 'border-amber-500 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <PosIcon src={tab.icon} className="w-4 h-4" /> {tr(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8 max-w-3xl">

        {/* ── Language ── */}
        {activeTab === 'general' && <section>
          <SectionTitle><span className="inline-flex items-center gap-1.5"><PosIcon src="/pos-icons/language.png" className="w-4 h-4" /> {tr('language')}</span></SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
            <p className="text-sm text-gray-500 flex-1">{tr('languageDesc')}</p>
            <div className="flex gap-2 shrink-0">
              {POS_LANGS.map(l => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 flex items-center gap-2 border-2 ${
                    lang === l.code
                      ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span className="text-base">{l.flag}</span> {l.label}
                  {lang === l.code && <span className="text-xs">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </section>}

        {/* ── Business Information ── */}
        {activeTab === 'general' && <section>
          <SectionTitle>{tr('setBizInfo')}</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
            {cfg && (
              <>
                {/* Logo upload */}
                <div className="flex items-center gap-4">
                  <label className="text-sm text-gray-500 w-24 shrink-0">{tr('setLogo')}</label>
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
                        {cfg.logoDataUrl ? tr('change') : tr('upload')}
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                      </label>
                      {cfg.logoDataUrl && (
                        <button
                          onClick={() => { setCfg(prev => prev ? { ...prev, logoDataUrl: '' } : prev); setCfgSaved(false) }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-50 transition"
                        >
                          {tr('remove')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <SettingInput label={tr('setBizName')}  value={cfg.barName}               onChange={v => updateCfg('barName', v)}         placeholder="Your Bar Name" />
                <SettingInput label={tr('setAddress')}        value={cfg.address}               onChange={v => updateCfg('address', v)}         placeholder="Sukhumvit Soi 11, Bangkok" />
                <SettingInput label={tr('setPhone')}          value={cfg.phone}                 onChange={v => updateCfg('phone', v)}           placeholder="02-xxx-xxxx" />
                <SettingInput label={tr('setTaxId')}         value={cfg.taxId}                 onChange={v => updateCfg('taxId', v)}           placeholder="0-0000-00000-00-0" />
                <SettingInput label={tr('setPromptPay')}      value={cfg.promptpayNumber ?? ''} onChange={v => updateCfg('promptpayNumber', v)} placeholder="0812345678" />
                <SettingInput label={tr('setGoogleReview')} value={cfg.googleReviewUrl ?? ''} onChange={v => updateCfg('googleReviewUrl', v)} placeholder="https://maps.app.goo.gl/..." />

                {/* Opening hours — bounds the reservation start-time slots */}
                <div className="flex items-center gap-4">
                  <label className="text-sm text-gray-500 w-24 shrink-0">{tr('setOpenHours')}</label>
                  <div className="flex-1 flex items-center gap-2">
                    <input type="time" value={cfg.openTime ?? '10:00'} onChange={e => updateCfg('openTime', e.target.value)}
                      className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-amber-400 transition" />
                    <span className="text-gray-400 font-bold">–</span>
                    <input type="time" value={cfg.closeTime ?? '23:00'} onChange={e => updateCfg('closeTime', e.target.value)}
                      className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-amber-400 transition" />
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 ml-28 -mt-2.5">{tr('setHoursHint')}</p>

                {/* Sales-day cutoff — for venues that trade past midnight */}
                <div className="flex items-center gap-4">
                  <label className="text-sm text-gray-500 w-24 shrink-0">{tr('setSalesDayCutoff')}</label>
                  <input type="time" value={cfg.businessDayCutoff ?? '00:00'} onChange={e => updateCfg('businessDayCutoff', e.target.value)}
                    className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-amber-400 transition" />
                </div>
                <p className="text-[11px] text-gray-400 ml-28 -mt-2.5">{tr('setSalesDayCutoffHint')}</p>

                <div className="pt-1">
                  <button
                    onClick={saveCfg}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 ${
                      cfgSaved ? 'bg-emerald-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-black'
                    }`}
                  >
                    {cfgSaved ? `✓ ${tr('savedBang')}` : tr('saveChanges')}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>}

        {/* ── Security ── */}
        {activeTab === 'general' && <section>
          <SectionTitle>{tr('setSecurity')}</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
            {cfg && (
              <>
                <div>
                  <p className="text-sm font-semibold text-gray-700">{tr('setDisplayTimeLock')}</p>
                  <p className="text-xs text-gray-400 mt-0.5 mb-3">
                    {tr('setDisplayTimeLockDesc')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { val: 0,  label: tr('setOff') },
                      { val: 5,  label: `5 ${tr('setMin')}` },
                      { val: 10, label: `10 ${tr('setMin')}` },
                      { val: 15, label: `15 ${tr('setMin')}` },
                      { val: 30, label: `30 ${tr('setMin')}` },
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
                    {cfgSaved ? `✓ ${tr('savedBang')}` : tr('saveChanges')}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>}

        {/* ── Revenue Targets ── */}
        {activeTab === 'general' && <section>
          <SectionTitle>{tr('setRevenueTargets')}</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
            {cfg && (
              <>
                <p className="text-xs text-gray-400 -mt-1 mb-1">
                  {tr('setRevenueTargetsDesc')}
                </p>
                {([
                  { key: 'dailyRevenueTarget'   as const, label: tr('setDailyTarget'),   placeholder: 'e.g. 20000' },
                  { key: 'weeklyRevenueTarget'  as const, label: tr('setWeeklyTarget'),  placeholder: 'e.g. 120000' },
                  { key: 'monthlyRevenueTarget' as const, label: tr('setMonthlyTarget'), placeholder: 'e.g. 500000' },
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
                    {cfgSaved ? `✓ ${tr('savedBang')}` : tr('saveChanges')}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>}

        {/* ── Billing (moved out of the sidebar) ── */}
        {activeTab === 'general' && isAdmin && <section>
          <SectionTitle>{tr('navBilling')}</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between gap-4 shadow-sm">
            <p className="text-sm text-gray-500 flex-1">{tr('setBillingDesc')}</p>
            <button
              onClick={() => router.push('/pos/billing')}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-stone-900 hover:bg-stone-800 text-white transition active:scale-95 shrink-0"
            >
              {tr('setOpenBilling')} →
            </button>
          </div>
        </section>}

        {/* ── Receipt & Printer ── */}
        {activeTab === 'printer' && <section>
          <SectionTitle>{tr('setReceiptPrinter')}</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-5 shadow-sm">
            {cfg && (
              <>
                {/* Template selector */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-3">{tr('setReceiptTemplate')}</p>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { id: 'classic' as ReceiptTemplate,  label: tr('tplClassic'),  desc: tr('tplClassicDesc') },
                      { id: 'modern'  as ReceiptTemplate,  label: tr('tplModern'),   desc: tr('tplModernDesc') },
                      { id: 'minimal' as ReceiptTemplate,  label: tr('tplMinimal'),  desc: tr('tplMinimalDesc') },
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
                                <div className="text-center text-[3.5px] text-gray-400 mt-0.5">Thank you · Come again</div>
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
                  <label className="text-sm text-gray-500 w-28 shrink-0 pt-2.5">{tr('setFooterText')}</label>
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
                  <label className="text-sm text-gray-500 w-28 shrink-0">{tr('setPaperSize')}</label>
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
                  {cfgSaved ? '✓ ' + tr('setSavedBang') : tr('setSaveReceipt')}
                </button>
              </>
            )}

            {/* ── Printer Connection ── */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{tr('setPrinterConn')}</p>

              {/* Connection type toggle */}
              {cfg && (
                <div className="flex gap-2 mb-4">
                  {(['bluetooth', 'lan'] as const).map(type => {
                    const active = (cfg.printerConnectionType ?? 'bluetooth') === type
                    return (
                      <button
                        key={type}
                        onClick={() => { updateCfg('printerConnectionType', type); setCfgSaved(false) }}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition active:scale-95 inline-flex items-center justify-center gap-1.5 ${
                          active ? 'bg-stone-900 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        <PosIcon src={type === 'bluetooth' ? '/pos-icons/bluetooth.png' : '/pos-icons/lan-wifi.png'} color={active ? '#ffffff' : undefined} className="w-4 h-4" />
                        {type === 'bluetooth' ? 'Bluetooth' : 'LAN / Wi-Fi'}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* ── LAN section ── */}
              {cfg && (cfg.printerConnectionType ?? 'bluetooth') === 'lan' && (
                <div className="flex flex-col gap-3">
                  <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-xs text-sky-700 leading-relaxed">
                    <p className="font-semibold mb-0.5">LAN / Wi-Fi Mode</p>
                    <p>ใช้ได้ทั้งบน Browser และ Android APK — ปริ้นเตอร์ต้องอยู่ใน Wi-Fi เดียวกัน</p>
                    <p className="mt-1 text-sky-500">Port มาตรฐาน ESC/POS: <strong>9100</strong> (Epson · Xprinter · Star · Citizen)</p>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="text-sm text-gray-500 w-28 shrink-0">{tr('setIpAddress')}</label>
                    <input
                      type="text"
                      value={cfg.printerLanIp ?? ''}
                      onChange={e => updateCfg('printerLanIp', e.target.value)}
                      placeholder="192.168.1.105"
                      className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-amber-400 transition"
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="text-sm text-gray-500 w-28 shrink-0">{tr('setPort')}</label>
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
                      {lanTestStatus === 'testing' ? 'Testing...' :
                       lanTestStatus === 'ok'      ? '✓ Connected!' :
                       lanTestStatus === 'error'   ? '✗ Failed' :
                                                     'Test Connection'}
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
                      <p className="font-semibold mb-0.5">Browser Mode</p>
                      <p>Bluetooth SPP ใช้งานได้เฉพาะใน Android APK (Capacitor) เท่านั้น</p>
                      <p className="mt-1 text-blue-500">Build APK ด้วย <code className="font-mono bg-blue-100 px-1 rounded">npx cap run android</code></p>
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${connected ? 'bg-emerald-400' : savedDevice ? 'bg-amber-400' : 'bg-gray-300'}`} />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {connected ? savedDevice?.name ?? tr('setConnected') : savedDevice ? savedDevice.name : tr('setNoPrinter')}
                        </p>
                        <p className="text-xs text-gray-400">
                          {connected ? tr('setConnected') + ' · ' + (savedDevice?.address ?? '') : savedDevice ? tr('setSavedTapReconnect') : tr('setScanToPair')}
                        </p>
                      </div>
                    </div>
                    {connected ? (
                      <button onClick={handleDisconnect} className="px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 text-gray-500 hover:bg-gray-100 transition">
                        {tr('setDisconnect')}
                      </button>
                    ) : savedDevice ? (
                      <div className="flex gap-2">
                        <button onClick={handleReconnect} disabled={btBusy} className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white transition active:scale-95">
                          {btConnecting ? '...' : tr('setReconnect')}
                        </button>
                        <button onClick={handleForget} className="px-3 py-2 rounded-xl text-xs font-semibold border border-red-100 text-red-400 hover:bg-red-50 transition">
                          {tr('setForget')}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {!connected && (
                    <div className="flex flex-col gap-3">
                      {!scanning ? (
                        <button onClick={handleStartScan} disabled={btBusy}
                          className={`py-2.5 rounded-xl text-sm font-bold transition active:scale-95 ${btBusy ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}>
                          Scan for Printers
                        </button>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 flex items-center gap-2 py-2.5 px-4 bg-blue-50 border border-blue-100 rounded-xl">
                            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
                            <span className="text-sm text-blue-700 font-medium">กำลังสแกน...</span>
                          </div>
                          <button onClick={handleStopScan} className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-500 hover:bg-gray-100 transition">{tr('setStop')}</button>
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
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition active:scale-95 inline-flex items-center justify-center gap-1.5 ${
                        printStatus === 'done' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                        btBusy               ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                                               'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                      {printStatus === 'printing' ? 'Printing...' : printStatus === 'done' ? '✓ Printed!' : <><PosIcon src="/pos-icons/receipt-printer.png" className="w-4 h-4" /> Test Print</>}
                    </button>
                    <button onClick={handleTestDrawer} disabled={btBusy || drawerStatus === 'opening'}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition active:scale-95 inline-flex items-center justify-center gap-1.5 ${
                        drawerStatus === 'done'    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                        drawerStatus === 'error'   ? 'bg-red-50 text-red-500 border border-red-100' :
                        drawerStatus === 'opening' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                                                     'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-100'}`}>
                      {drawerStatus === 'opening' ? 'Opening...' : drawerStatus === 'done' ? '✓ Open!' : drawerStatus === 'error' ? '✗ Failed' : <><PosIcon src="/pos-icons/test-drawer.png" className="w-4 h-4" /> Test Drawer</>}
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
        {activeTab === 'payment' && isAdmin && <section>
          <SectionTitle>{tr('setOnlinePayment')}</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <PaymentSettings />
            <TransferSettings />
          </div>
        </section>}

        {/* ── Google Sheets ── */}
        {activeTab === 'integrations' && <section>
          <SectionTitle>{tr('setGoogleSheets')}</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <PosIcon src="/pos-icons/export.png" className="w-7 h-7" />
                <div>
                  <h3 className="font-bold text-gray-900">{tr('setAutoExport')}</h3>
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
                                            'Setup Headers'}
              </button>
            </div>

            <div className={`rounded-xl px-4 py-3 flex items-center justify-between gap-3 border ${
              sheetsCfg === null       ? 'bg-gray-50 border-gray-100' :
              sheetsCfg.configured    ? 'bg-emerald-50 border-emerald-100' :
                                        'bg-amber-50 border-amber-200'
            }`}>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">{tr('setSheetId')}</p>
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
                  {sheetsCfg.configured ? '✓ ' + tr('setConfigured') : tr('setSetEnvVars')}
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
          <SectionTitle>{tr('setTelegram')}</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">

            {/* Status row */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <PosIcon src="/pos-icons/telegram.png" className="w-7 h-7" />
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
                  {tgCfg.configured && tgCfg.tokenOk ? '✓ ' + tr('setActive')
                    : tgCfg.hasToken ? tr('setPartial')
                    : tr('setNotSet')}
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
                  <span className="text-xs text-gray-500">{tr('setChatId')}</span>
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
                                            <span className="inline-flex items-center justify-center gap-1.5"><PosIcon src="/pos-icons/telegram.png" color="#ffffff" className="w-4 h-4" /> Test Message</span>}
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
                                             <span className="inline-flex items-center justify-center gap-1.5"><PosIcon src="/pos-icons/daily-summary.png" color="#000000" className="w-4 h-4" /> Daily Summary</span>}
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
                  {tgDetect === 'loading' ? 'Detecting...' : 'Detect Chat ID'}
                </button>
                {tgDetectResult && (
                  <div className="bg-white border border-emerald-200 rounded-xl px-4 py-3 flex flex-col gap-1">
                    <p className="text-xs font-semibold text-emerald-700">Chat ID found!</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">{tr('setChatId')}</span>
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
          <SectionTitle>{tr('setLineNotify')}</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">

            {/* Status row */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <PosIcon src="/pos-icons/line.png" className="w-7 h-7" />
                <div>
                  <h3 className="font-bold text-gray-900">{tr('setLineNotify')}</h3>
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
                  {lineCfg.configured ? '✓ ' + tr('setActive')
                    : (lineCfg.hasToken || lineCfg.hasTargetId) ? tr('setPartial')
                    : tr('setNotSet')}
                </span>
              )}
            </div>

            {/* Config info (configured) */}
            {lineCfg?.configured && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{tr('setChannelToken')}</span>
                  <code className="text-xs font-mono text-emerald-700">{lineCfg.tokenPreview}</code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{tr('setTargetId')}</span>
                  <code className="text-xs font-mono text-emerald-700">{lineCfg.targetId}</code>
                </div>
              </div>
            )}

            {/* Partial config warning */}
            {lineCfg && !lineCfg.configured && (lineCfg.hasToken || lineCfg.hasTargetId) && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700 flex flex-col gap-1">
                <p className="font-semibold">{tr('setMissingEnv')}</p>
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
                                              <span className="inline-flex items-center justify-center gap-1.5"><PosIcon src="/pos-icons/line.png" color="#ffffff" className="w-4 h-4" /> Test Message</span>}
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
                                               <span className="inline-flex items-center justify-center gap-1.5"><PosIcon src="/pos-icons/daily-summary.png" color="#000000" className="w-4 h-4" /> Daily Summary</span>}
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
          <SectionTitle>{tr('setQrOrdering')}</SectionTitle>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-5 shadow-sm">

            {/* Config row */}
            <div className="flex flex-col gap-3">
              <p className="text-xs text-gray-500 leading-relaxed">
                Generate QR codes for each table. Customers scan → browse the menu → place their order directly to the kitchen.
              </p>

              {/* Auto-print incoming QR orders on THIS device */}
              <button
                type="button"
                onClick={toggleQrAutoPrint}
                className="flex items-center justify-between gap-3 w-full text-left bg-amber-50/60 border border-amber-100 rounded-xl px-3 py-2.5 active:scale-[0.99] transition"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-800">{tr('qrAutoPrintLabel')}</span>
                  <span className="block text-[11px] text-gray-500 leading-snug mt-0.5">{tr('qrAutoPrintDesc')}</span>
                </span>
                <span className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition ${qrAutoPrint ? 'bg-amber-500' : 'bg-gray-300'}`}>
                  <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${qrAutoPrint ? 'translate-x-5' : ''}`} />
                </span>
              </button>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{tr('setBaseUrl')}</label>
                <input
                  type="text"
                  value={qrBaseUrl}
                  onChange={e => setQrBaseUrl(e.target.value.trim().replace(/\/+$/, ''))}
                  placeholder="https://your-domain.com"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-amber-400 transition"
                />
                {qrBaseUrl.includes('localhost') || qrBaseUrl.includes('127.0.0.1') ? (
                  <p className="text-[11px] text-amber-600 leading-relaxed">
                    Base URL เป็น localhost — มือถือเครื่องอื่นสแกนแล้วจะเปิดไม่ได้ เพราะ &quot;localhost&quot; บนมือถือหมายถึงตัวมือถือเอง ไม่ใช่เครื่องนี้
                    ให้แก้เป็น IP เครื่องนี้ในวง LAN เดียวกัน (เช่น <code>http://192.168.1.50:3000</code>) หรือโดเมนจริงหลัง deploy
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-400">QR จะลิงก์ไปที่ {qrBaseUrl || '…'}/order/{storeSlug || '…'}/[tableNo]</p>
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
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-gray-600"
                    >
                      <PosIcon src="/pos-icons/refresh.png" className="w-3 h-3" /> Refresh
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
                  รายชื่อโต๊ะดึงมาจากผัง Floor Plan โดยตรง — เปลี่ยนชื่อ/เพิ่ม/ลบโต๊ะที่นั่น แล้วกด Refresh
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
                  {qrLoading ? 'Generating...' : <span className="inline-flex items-center justify-center gap-1.5"><PosIcon src="/pos-icons/generate-qr.png" color="#000000" className="w-4 h-4" /> Generate QR Codes ({selectedQrTables.size})</span>}
                </button>
                {qrImages.length > 0 && (
                  <button
                    onClick={printQRSheet}
                    className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gray-900 hover:bg-gray-700 text-white transition active:scale-95"
                  >
                    Print All
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
                      className="w-full text-xs py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold transition active:scale-95 inline-flex items-center justify-center gap-1"
                    >
                      <PosIcon src="/pos-icons/export.png" className="w-3.5 h-3.5" /> Download
                    </button>
                  </div>
                ))}
              </div>
            )}

            {qrImages.length === 0 && (
              <div className="border-2 border-dashed border-gray-100 rounded-2xl py-8 text-center text-gray-300 flex flex-col items-center">
                <PosIcon src="/pos-icons/qr-ordering.png" className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">{tr('setClickGenerate')}</p>
              </div>
            )}
          </div>

          {/* Member sign-up link + QR */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-4 mt-4">
            <div>
              <h3 className="font-bold text-gray-900">{tr('memberSignupTitle')}</h3>
              <p className="text-sm text-gray-500 mt-1 leading-snug">{tr('memberSignupDesc')}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              {memberQr && <img src={memberQr} alt="Member sign-up QR" className="w-32 h-32 rounded-xl border border-gray-100 shrink-0" />}
              <div className="flex-1 min-w-0 w-full flex flex-col gap-2">
                <p className="text-[11px] text-gray-500 font-mono break-all bg-gray-50 rounded-lg px-2 py-1.5">{memberSignupUrl}</p>
                <div className="flex gap-2">
                  <button onClick={copyMemberLink}
                    className="flex-1 text-xs py-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-white font-semibold transition active:scale-95">
                    {linkCopied ? tr('linkCopied') : tr('copyLink')}
                  </button>
                  {memberQr && (
                    <button
                      onClick={() => { const a = document.createElement('a'); a.href = memberQr; a.download = 'member-signup-qr.png'; a.click() }}
                      className="flex-1 text-xs py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold transition active:scale-95">
                      {tr('downloadQr')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Table-reservation link + QR + printable poster */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-4 mt-4">
            <div>
              <h3 className="font-bold text-gray-900">{tr('reserveLinkTitle')}</h3>
              <p className="text-sm text-gray-500 mt-1 leading-snug">{tr('reserveLinkDesc')}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              {reserveQr && <img src={reserveQr} alt="Reservation QR" className="w-32 h-32 rounded-xl border border-gray-100 shrink-0" />}
              <div className="flex-1 min-w-0 w-full flex flex-col gap-2">
                <p className="text-[11px] text-gray-500 font-mono break-all bg-gray-50 rounded-lg px-2 py-1.5">{reserveUrl}</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={copyReserveLink}
                    className="flex-1 min-w-[90px] text-xs py-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-white font-semibold transition active:scale-95">
                    {reserveCopied ? tr('linkCopied') : tr('copyLink')}
                  </button>
                  {reserveQr && (
                    <button
                      onClick={() => { const a = document.createElement('a'); a.href = reserveQr; a.download = 'reservation-qr.png'; a.click() }}
                      className="flex-1 min-w-[90px] text-xs py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold transition active:scale-95">
                      {tr('downloadQr')}
                    </button>
                  )}
                  <button onClick={printReservePoster}
                    className="flex-1 min-w-[90px] text-xs py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold transition active:scale-95">
                    {tr('printPoster')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Member benefits editor — shown on the sign-up page */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-4 mt-4">
            <div>
              <h3 className="font-bold text-gray-900">{tr('memberBenefitsTitle')}</h3>
              <p className="text-sm text-gray-500 mt-1 leading-snug">{tr('memberBenefitsDesc')}</p>
            </div>
            <div className="flex flex-col gap-2">
              {benefits.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={b.icon}
                    onChange={e => updateBenefit(i, 'icon', e.target.value)}
                    className="w-12 text-center border border-gray-200 rounded-lg px-1 py-2 text-lg focus:outline-none focus:border-amber-400 transition"
                    maxLength={4}
                  />
                  <input
                    value={b.text}
                    onChange={e => updateBenefit(i, 'text', e.target.value)}
                    placeholder={tr('benefitTextPh')}
                    className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 transition"
                  />
                  <button onClick={() => removeBenefit(i)} className="shrink-0 w-8 h-8 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition text-lg">×</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={addBenefit} className="flex-1 text-xs py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold transition active:scale-95">
                {tr('addBenefit')}
              </button>
              <button onClick={saveBenefits} className="flex-1 text-xs py-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-white font-semibold transition active:scale-95">
                {benefitsSaved ? tr('benefitsSaved') : tr('benefitsSaveBtn')}
              </button>
            </div>
          </div>
        </section>}

        {/* ── Delivery (owner only — holds partner API secrets) ── */}
        {activeTab === 'integrations' && isAdmin && (
          <section>
            <SectionTitle>{tr('setDelivery')}</SectionTitle>
            <DeliverySettingsSection />
          </section>
        )}

        {/* ── System / Integrations ── */}
        {activeTab === 'integrations' && <section>
          <SectionTitle>{tr('setSystemIntegrations')}</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {SYSTEM_CARDS.map((card) => (
              <div key={card.title} className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
                <div className="flex items-start justify-end gap-2">
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
                    {typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}/order/{storeSlug || '…'}/T1
                  </p>
                )}
                {card.badge === 'Coming soon' && (
                  <span className="text-xs text-amber-500 font-semibold">{tr('setComingSoon')}</span>
                )}
              </div>
            ))}
          </div>
        </section>}

      </div>

      {/* Google account section */}
      {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
        <div className="px-6 pb-4 shrink-0">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{tr('setGoogleAccount')}</p>
          <OwnerProfileBadge />
        </div>
      )}

      <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400 shrink-0 flex items-center justify-between bg-white">
        <span>BAZE POS v{APP_VERSION}</span>
        <span>{AI_NAME}</span>
      </div>
    </div>
  )
}
