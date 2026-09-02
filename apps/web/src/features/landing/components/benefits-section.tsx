import { ChartNoAxesCombined, Clock3, HandCoins, Smartphone } from "lucide-react"

import { SectionHeading } from "@/features/landing/components/section-heading"

const benefits = [
  {
    description: "Centralize o que foi sugerido e veja quais extras ainda aguardam uma resposta.",
    icon: ChartNoAxesCombined,
    title: "Visão clara das oportunidades",
  },
  {
    description: "Apresente o escopo e o preço antes de executar qualquer trabalho adicional.",
    icon: HandCoins,
    title: "Mais transparência na negociação",
  },
  {
    description: "Envie uma proposta organizada sem interromper o ritmo do atendimento.",
    icon: Clock3,
    title: "Menos conversa desencontrada",
  },
  {
    description: "Ofereça uma experiência objetiva para o cliente aprovar ou recusar pelo celular.",
    icon: Smartphone,
    title: "Decisão simples para o cliente",
  },
]

export function BenefitsSection() {
  return (
    <section className="scroll-mt-28 bg-muted/35 px-4 py-16 sm:px-6 sm:py-20 lg:px-8" id="beneficios">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]" data-reveal>
        <SectionHeading
          description="O ExtraOK ajuda a profissionalizar a oferta de serviços adicionais sem deixar o atendimento impessoal."
          eyebrow="Benefícios"
          title="Mais organização para vender melhor durante cada visita"
        />

        <ul className="divide-y divide-border border-y border-border">
          {benefits.map((benefit) => {
            const Icon = benefit.icon

            return (
              <li className="flex gap-4 py-6" key={benefit.title}>
                <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-background text-primary">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-foreground">{benefit.title}</h3>
                  <p className="mt-1 leading-6 text-muted-foreground">{benefit.description}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
