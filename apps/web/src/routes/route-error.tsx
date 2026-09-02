import { AlertTriangle, RefreshCw } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `Não foi possível abrir esta página (${error.status}).`
    : 'Ocorreu uma falha inesperada ao carregar esta área.'

  return (
    <main className="grid min-h-[60vh] place-items-center px-5 py-12">
      <div className="max-w-md text-center" role="alert">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive-soft text-destructive">
          <AlertTriangle className="size-7" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-primary">Algo não saiu como esperado</h1>
        <p className="mt-2 text-muted-foreground">{message}</p>
        <Button className="mt-6" onClick={() => window.location.reload()}>
          <RefreshCw className="size-4" />
          Tentar novamente
        </Button>
      </div>
    </main>
  )
}
