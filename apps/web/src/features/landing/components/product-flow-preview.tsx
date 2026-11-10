import { ArrowDown, Check, Sparkles } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const examples = [
  {
    label: "Climatização",
    title: "Higienização do ar-condicionado",
    draft: "limpar filtros e bandeja do ar-condicionado",
    description: "Limpeza dos filtros e da bandeja do ar-condicionado para auxiliar na higienização do equipamento.",
  },
  {
    label: "Pintura",
    title: "Retoque de pintura",
    draft: "retocar pintura na parede da sala onde tem marcas",
    description: "Retoque da pintura nos pontos com marcas na parede da sala, para melhorar o acabamento dessas áreas.",
  },
  {
    label: "Estofados",
    title: "Limpeza de sofá",
    draft: "limpar o tecido do sofá de dois lugares",
    description: "Limpeza do revestimento em tecido do sofá de dois lugares, para auxiliar na conservação do estofado.",
  },
]

export function ProductFlowPreview() {
  const [exampleIndex, setExampleIndex] = useState(0)
  const example = examples[exampleIndex]!

  return (
    <article
      aria-labelledby="ai-preview-title"
      className="relative mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-card text-left shadow-xl shadow-slate-950/5"
    >
      <header className="flex items-center gap-3 border-b border-border px-5 py-5 sm:px-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Sparkles aria-hidden="true" className="size-5" />
        </span>
        <h2 id="ai-preview-title" className="min-w-0 flex-1 text-lg font-semibold text-card-foreground">
          Sua ideia, explicada com clareza
        </h2>
      </header>

      <div className="p-5 sm:p-6">
        <div aria-label="Escolha um exemplo de serviço" className="flex flex-wrap gap-2" role="group">
          {examples.map((item, index) => (
            <Button
              aria-pressed={exampleIndex === index}
              className={cn("rounded-full text-xs", exampleIndex === index && "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100")}
              key={item.label}
              onClick={() => setExampleIndex(index)}
              size="sm"
              variant="outline"
            >
              {item.label}
            </Button>
          ))}
        </div>

        <div aria-atomic="true" aria-live="polite" className="mt-5">
          <h3 className="text-sm font-semibold text-card-foreground">{example.title}</h3>
          <div className="mt-3 rounded-xl border border-border bg-muted/35 p-4">
            <p className="text-xs font-medium text-muted-foreground">Seu rascunho</p>
            <p className="mt-2 text-sm leading-6 text-card-foreground">{example.draft}</p>
          </div>

          <div className="flex justify-center py-2 text-emerald-700" aria-hidden="true">
            <ArrowDown className="size-4" />
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
              <Sparkles aria-hidden="true" className="size-3.5" />
              Exemplo de descrição melhorada
            </p>
            <p className="mt-2 text-sm leading-6 text-card-foreground">{example.description}</p>
            <p className="mt-4 flex items-center gap-2 border-t border-emerald-200/70 pt-3 text-xs font-medium text-emerald-800">
              <Check aria-hidden="true" className="size-3.5 shrink-0" />
              Você revisa antes de aplicar
            </p>
          </div>
        </div>

        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          A IA também pode criar uma descrição a partir do título do serviço.
          Você define o preço e envia a proposta para aprovação.
        </p>
      </div>

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-muted/25 px-5 py-3 sm:px-6">
        <Badge className="text-muted-foreground" variant="outline">Demonstração</Badge>
        <p className="text-xs text-muted-foreground">Exemplos ilustrativos. Nenhum dado é enviado à IA aqui.</p>
      </footer>
    </article>
  )
}
