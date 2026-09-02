import { ArrowRight, PlayCircle, ShieldCheck } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProductFlowPreview } from "@/features/landing/components/product-flow-preview"

export function HeroSection() {
  return (
    <section
      aria-labelledby="hero-title"
      className="overflow-hidden border-b border-border bg-background px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(480px,1.1fr)] lg:gap-16">
        <div className="max-w-2xl">
          <Badge
            className="mb-6 border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800"
            data-hero-item
            variant="outline"
          >
            Feito para quem presta serviços
          </Badge>

          <h1
            className="text-balance text-4xl font-bold leading-tight tracking-[-0.035em] text-foreground sm:text-5xl lg:text-6xl"
            data-hero-item
            id="hero-title"
          >
            Aumente o valor de cada atendimento, sem precisar buscar novos clientes.
          </h1>

          <p
            className="mt-6 max-w-xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl"
            data-hero-item
          >
            Registre o atendimento, sugira serviços extras no momento certo e envie um link para o
            cliente aprovar ou recusar pelo celular.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row" data-hero-item>
            <Button asChild size="lg">
              <Link to="/cadastro">
                Criar minha conta
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#como-funciona">
                <PlayCircle aria-hidden="true" className="size-4" />
                Entender o fluxo
              </a>
            </Button>
          </div>

          <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground" data-hero-item>
            <ShieldCheck aria-hidden="true" className="size-4 text-emerald-700" />
            O cliente vê apenas as informações necessárias para decidir.
          </p>
        </div>

        <div data-hero-item>
          <ProductFlowPreview />
        </div>
      </div>
    </section>
  )
}
