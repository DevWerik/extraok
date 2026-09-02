import { ShieldCheck } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Brand } from '@/components/layout/brand'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/features/auth/auth.queries'

export function ProtectedRoute() {
  const location = useLocation()
  const session = useSession()

  if (session.isPending) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-5" role="status">
        <div className="w-full max-w-sm space-y-6 text-center">
          <Brand className="justify-center" />
          <div className="space-y-3" aria-hidden="true">
            <Skeleton className="mx-auto h-5 w-48" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
          <span className="sr-only">Validando sua sessão</span>
        </div>
      </main>
    )
  }

  if (session.isError) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-5">
        <div className="max-w-md text-center" role="alert">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive-soft text-destructive">
            <ShieldCheck className="size-7" />
          </span>
          <h1 className="mt-5 text-2xl font-bold text-primary">Não foi possível validar sua sessão</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Verifique sua conexão e tente novamente. Nenhum conteúdo privado foi exibido.
          </p>
          <Button className="mt-6" onClick={() => session.refetch()}>Tentar novamente</Button>
        </div>
      </main>
    )
  }

  if (!session.data) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />
  }

  return <Outlet />
}
