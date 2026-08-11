import { redirect } from 'next/navigation'
import { getSoleStoreId, getStore } from '@/lib/store'

// Backwards-compat for OLD QR codes that were printed as /order/{table} (before
// the store was added to the path). Here the single segment is the table number.
// While there's exactly one store, redirect to the new /order/{slug}/{table} so
// old QRs keep working without reprinting. If 2+ stores exist an old single-
// segment QR is ambiguous — show a friendly "please rescan" message.
export const dynamic = 'force-dynamic'

export default async function LegacyOrderRedirect({ params }: { params: Promise<{ store: string }> }) {
  const { store: tableNo } = await params
  const sid = await getSoleStoreId()
  if (sid) {
    const s = await getStore(sid)
    redirect(`/order/${s?.slug || sid}/${encodeURIComponent(tableNo)}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="max-w-sm text-center bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
        <p className="text-4xl mb-3">📷</p>
        <h1 className="text-lg font-black text-gray-900">QR code ต้องอัปเดต</h1>
        <p className="text-sm text-gray-500 mt-2">
          กรุณาสแกน QR code ใหม่ที่โต๊ะ หรือแจ้งพนักงาน
        </p>
        <p className="text-xs text-gray-400 mt-3">
          Please scan the updated QR at your table, or ask our staff.
        </p>
      </div>
    </div>
  )
}
