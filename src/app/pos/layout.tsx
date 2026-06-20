import Sidebar from '@/components/pos/Sidebar'
import AuthGuard from '@/components/pos/AuthGuard'
import { PosAuthProvider } from '@/lib/pos-auth'

export const metadata = {
  title: 'BAR POS — Staff Dashboard',
  description: 'POS tablet interface for bar staff',
}

export default function POSLayout({ children }: { children: React.ReactNode }) {
  return (
    <PosAuthProvider>
      <AuthGuard>
        <div className="h-screen flex bg-[#FAF8F4] overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden flex flex-col pb-16 sm:pb-0">
            {children}
          </main>
        </div>
      </AuthGuard>
    </PosAuthProvider>
  )
}
