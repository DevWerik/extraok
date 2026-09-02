import { ArrowRight, CheckCircle2 } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"

export function FinalCtaSection() {
  return (
    <section className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8" data-reveal>
      <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl bg-primary px-6 py-10 text-primary-foreground sm:px-10 sm:py-12 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:px-14">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            Próximo atendimento, próxima oportunidade
          </p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Transforme serviços percebidos em propostas organizadas.
          </h2>
          <p className="mt-4 text-pretty leading-7 text-primary-foreground/75">
            Crie sua conta e comece a registrar clientes, atendimentos e aprovações reais.
          </p>
        </div>

        <Button asChild className="mt-7 shrink-0 lg:mt-0" size="lg" variant="secondary">
          <Link to="/cadastro">
            Criar conta
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  )
}
