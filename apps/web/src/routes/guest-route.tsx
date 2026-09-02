import { Navigate, Outlet } from 'react-router-dom'
import { Brand } from '@/components/layout/brand'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/features/auth/auth.queries'

export function GuestRoute() {
  const session = useSession()

  if (session.isPending) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-5" role="status">
        <div className="w-full max-w-sm space-y-6 text-center">
          <Brand className="justify-center" />
          <Skeleton className="mx-auto h-24 w-full rounded-2xl" aria-hidden="true" />
          <span className="sr-only">Verificando sua conta</span>
        </div>
      </main>
    )
  }

  if (session.data) return <Navigate to="/dashboard" replace />

  return <Outlet />
}
