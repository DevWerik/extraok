import { Brand } from '@/components/layout/brand'

export function RouteLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5" role="status" aria-busy="true">
      <div className="space-y-4 text-center">
        <Brand className="justify-center" />
        <p className="text-sm text-muted-foreground">Carregando página…</p>
      </div>
    </main>
  )
}
