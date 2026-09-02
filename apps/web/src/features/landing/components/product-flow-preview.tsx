import {
  CalendarClock,
  Check,
  CircleDollarSign,
  Copy,
  Send,
  UserRound,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ApprovalProgress } from "@/features/landing/components/approval-progress"
import { formatCurrency } from "@/lib/formatters"

const extraPriceInCents = 12000

export function ProductFlowPreview() {
  return (
    <article
      aria-label="Exemplo do fluxo de aprovação de um serviço extra"
      className="relative mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-card text-left shadow-xl shadow-slate-950/5"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Atendimento em andamento
          </p>
          <h2 className="mt-1 text-base font-semibold text-card-foreground">
            Manutenção de ar-condicionado
          </h2>
        </div>
        <Badge className="border-amber-200 bg-amber-50 text-amber-800" variant="outline">
          Aguardando resposta
        </Badge>
      </header>

      <div className="space-y-5 p-5 sm:p-6">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <UserRound aria-hidden="true" className="size-4 text-muted-foreground" />
            <div>
              <dt className="text-xs text-muted-foreground">Cliente</dt>
              <dd className="font-medium text-card-foreground">Mariana Lopes</dd>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CalendarClock aria-hidden="true" className="size-4 text-muted-foreground" />
            <div>
              <dt className="text-xs text-muted-foreground">Agendado para</dt>
              <dd className="font-medium text-card-foreground">18/09/2026 às 14h30</dd>
            </div>
          </div>
        </dl>

        <section aria-labelledby="preview-extra-title" className="border-y border-border py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Serviço extra sugerido
              </p>
              <h3 id="preview-extra-title" className="mt-1 font-semibold text-card-foreground">
                Higienização completa
              </h3>
              <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
                Limpeza da evaporadora, filtros e bandeja para melhorar a qualidade do ar.
              </p>
            </div>
            <strong className="shrink-0 text-base text-card-foreground">
              {formatCurrency(extraPriceInCents)}
            </strong>
          </div>
        </section>

        <ApprovalProgress label="Progresso da aprovação" value={67} />

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button className="flex-1" type="button">
            <Send aria-hidden="true" className="size-4" />
            Enviar para o cliente
          </Button>
          <Button aria-label="Copiar link de aprovação" type="button" variant="outline">
            <Copy aria-hidden="true" className="size-4" />
            Copiar link
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800 sm:px-6">
        <Check aria-hidden="true" className="size-4" />
        Link pronto para uma decisão simples pelo celular
        <CircleDollarSign aria-hidden="true" className="ml-auto hidden size-4 sm:block" />
      </div>
    </article>
  )
}
