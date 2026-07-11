import Sidebar from '@/components/pos/Sidebar'
import AppAuthGuard from '@/components/pos/AppAuthGuard'
import AIChatPanel from '@/components/pos/AIChatPanel'
import LockScreen from '@/components/pos/LockScreen'
import StaffGate from '@/components/pos/StaffGate'
import PrinterAutoConnect from '@/components/pos/PrinterAutoConnect'
import { PosAuthProvider } from '@/lib/pos-auth'

export const metadata = {
  title: 'BAR POS — Staff Dashboard',
  description: 'POS tablet interface for bar staff',
}

export default function POSLayout({ children }: { children: React.ReactNode }) {
  return (
    <PosAuthProvider>
      <AppAuthGuard>
        <div className="h-screen flex bg-[#FAF8F4] overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden flex flex-col pb-16 sm:pb-0">
            {children}
          </main>
        </div>
        <AIChatPanel />
        <LockScreen />
        <StaffGate />
        <PrinterAutoConnect />
      </AppAuthGuard>
    </PosAuthProvider>
  )
}
