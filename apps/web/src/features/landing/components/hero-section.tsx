import { ArrowRight, Check, Sparkles } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProductFlowPreview } from "@/features/landing/components/product-flow-preview"

export function HeroSection() {
  return (
    <section
      aria-labelledby="hero-title"
      className="overflow-hidden border-b border-border bg-background px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(480px,1.1fr)] lg:gap-16">
        <div className="max-w-2xl">
          <div className="mb-6 flex flex-wrap items-center gap-2" data-hero-item>
            <Badge className="px-3 py-1 text-muted-foreground" variant="outline">
              Feito para quem presta serviços
            </Badge>
            <Badge className="gap-1.5 border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800" variant="outline">
              <Sparkles aria-hidden="true" />
              IA integrada
            </Badge>
          </div>

          <h1
            className="text-balance text-4xl font-bold leading-tight tracking-[-0.035em] text-foreground sm:text-5xl lg:text-6xl"
            data-hero-item
            id="hero-title"
          >
            Mais valor em cada atendimento.
            <span className="mt-2 block text-emerald-700">Com a ajuda da IA.</span>
          </h1>

          <p
            className="mt-6 max-w-xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl"
            data-hero-item
          >
            Organize seus atendimentos e use a IA para gerar ou melhorar descrições de serviços extras.
            Depois, envie a proposta para o cliente aprovar ou recusar pelo celular.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row" data-hero-item>
            <Button asChild size="lg">
              <Link to="/cadastro">
                Criar minha conta
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#ia-na-pratica">
                <Sparkles aria-hidden="true" className="size-4" />
                Ver a IA na prática
              </a>
            </Button>
          </div>

          <p className="mt-5 flex items-start gap-2 text-sm leading-6 text-muted-foreground" data-hero-item>
            <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-emerald-700" />
            A IA sugere o texto. Você revisa e decide o que enviar.
          </p>
        </div>

        <div className="min-w-0 scroll-mt-40" data-hero-item id="ia-na-pratica">
          <ProductFlowPreview />
        </div>
      </div>
    </section>
  )
}
