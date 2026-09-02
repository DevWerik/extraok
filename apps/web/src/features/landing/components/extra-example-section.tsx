import { CheckCircle2, Droplets, ShieldCheck, Wrench } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { SectionHeading } from "@/features/landing/components/section-heading"
import { formatCurrency } from "@/lib/formatters"

const exampleExtraPriceInCents = 8500

export function ExtraExampleSection() {
  return (
    <section className="scroll-mt-28 px-4 py-16 sm:px-6 sm:py-20 lg:px-8" id="exemplo">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-16" data-reveal>
        <SectionHeading
          description="O cliente recebe contexto suficiente para decidir, enquanto o prestador mantém preço e escopo registrados."
          eyebrow="Exemplo prático"
          title="Uma oportunidade apresentada com clareza, sem pressão"
        />

        <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-lg shadow-slate-950/5">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Wrench aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Atendimento principal</p>
              <h3 className="font-semibold text-card-foreground">Revisão preventiva do equipamento</h3>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-sm">
                <Badge className="mb-3 border-emerald-200 bg-emerald-50 text-emerald-800" variant="outline">
                  Extra recomendado
                </Badge>
                <h4 className="text-xl font-semibold text-card-foreground">Limpeza do dreno</h4>
                <p className="mt-2 leading-7 text-muted-foreground">
                  Desobstrução e higienização da linha de drenagem para reduzir vazamentos e mau odor.
                </p>
              </div>
              <strong className="text-xl text-card-foreground">
                {formatCurrency(exampleExtraPriceInCents)}
              </strong>
            </div>

            <ul className="mt-6 grid gap-3 border-t border-border pt-5 text-sm text-muted-foreground sm:grid-cols-2">
              <li className="flex items-center gap-2">
                <Droplets aria-hidden="true" className="size-4 text-emerald-700" />
                Escopo explicado
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck aria-hidden="true" className="size-4 text-emerald-700" />
                Preço antes da execução
              </li>
              <li className="flex items-center gap-2 sm:col-span-2">
                <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-700" />
                Resposta registrada como aprovada ou recusada
              </li>
            </ul>
          </div>
        </article>
      </div>
    </section>
  )
}
