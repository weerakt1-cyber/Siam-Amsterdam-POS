import Sidebar from '@/components/pos/Sidebar'
import AppAuthGuard from '@/components/pos/AppAuthGuard'
import AIChatPanel from '@/components/pos/AIChatPanel'
import LockScreen from '@/components/pos/LockScreen'
import StaffGate from '@/components/pos/StaffGate'
import ShiftGate from '@/components/pos/ShiftGate'
import { ShiftProvider } from '@/lib/pos-shift'
import PrinterAutoConnect from '@/components/pos/PrinterAutoConnect'
import QrOrderAutoPrint from '@/components/pos/QrOrderAutoPrint'
import SettingsSync from '@/components/pos/SettingsSync'
import SubscriptionBanner from '@/components/pos/SubscriptionBanner'
import InstallPrompt from '@/components/pos/InstallPrompt'
import OnboardingChecklist from '@/components/pos/OnboardingChecklist'
import { PosAuthProvider } from '@/lib/pos-auth'
import { PosLangProvider } from '@/lib/pos-i18n'

export const metadata = {
  title: 'PLOEN POS — Staff Dashboard',
  description: 'POS tablet interface for bar staff',
}

export default function POSLayout({ children }: { children: React.ReactNode }) {
  return (
    <PosAuthProvider>
      <PosLangProvider>
      <AppAuthGuard>
        <ShiftProvider>
          <div className="h-screen flex bg-[#FAF8F4] overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-hidden flex flex-col pb-16 sm:pb-0">
              <SubscriptionBanner />
              <OnboardingChecklist />
              {children}
            </main>
          </div>
          <AIChatPanel />
          <LockScreen />
          <StaffGate />
          <ShiftGate />
          <PrinterAutoConnect />
          <QrOrderAutoPrint />
          <SettingsSync />
          <InstallPrompt />
        </ShiftProvider>
      </AppAuthGuard>
      </PosLangProvider>
    </PosAuthProvider>
  )
}
