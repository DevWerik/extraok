import { ArrowLeft, MapPinOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from '@/components/layout/brand'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-12">
      <div className="w-full max-w-lg text-center">
        <Brand className="mb-12" />
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-secondary text-primary">
          <MapPinOff className="size-8" aria-hidden="true" />
        </span>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.16em] text-success">Erro 404</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-primary sm:text-4xl">Esta página não foi encontrada</h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
          O endereço pode estar incorreto ou a página pode ter mudado. Volte para uma área conhecida do ExtraOK.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link to="/">
            <ArrowLeft className="size-4" />
            Voltar ao início
          </Link>
        </Button>
      </div>
    </main>
  )
}
