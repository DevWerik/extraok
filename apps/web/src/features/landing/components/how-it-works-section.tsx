import { ClipboardCheck, MessageCircleCheck, PackagePlus } from "lucide-react"

import { SectionHeading } from "@/features/landing/components/section-heading"

const steps = [
  {
    description: "Cadastre o cliente, o serviço principal e a data combinada em poucos campos.",
    icon: ClipboardCheck,
    number: "01",
    title: "Registre o atendimento",
  },
  {
    description: "Inclua título, descrição e preço de cada oportunidade percebida durante o serviço.",
    icon: PackagePlus,
    number: "02",
    title: "Ofereça serviços extras",
  },
  {
    description: "Compartilhe o link e acompanhe uma resposta clara: pendente, aprovado ou recusado.",
    icon: MessageCircleCheck,
    number: "03",
    title: "Receba a aprovação",
  },
]

export function HowItWorksSection() {
  return (
    <section className="scroll-mt-28 px-4 py-16 sm:px-6 sm:py-20 lg:px-8" id="como-funciona">
      <div className="mx-auto max-w-7xl" data-reveal>
        <SectionHeading
          align="center"
          description="Um fluxo direto para transformar oportunidades percebidas durante o atendimento em propostas fáceis de entender."
          eyebrow="Como funciona"
          title="Do serviço identificado à resposta do cliente"
        />

        <ol className="mt-12 grid divide-y divide-border border-y border-border md:grid-cols-3 md:divide-x md:divide-y-0">
          {steps.map((step) => {
            const Icon = step.icon

            return (
              <li className="relative px-2 py-8 md:px-8" key={step.number}>
                <div className="flex items-center justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="text-sm font-bold tracking-[0.18em] text-muted-foreground">
                    {step.number}
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 leading-7 text-muted-foreground">{step.description}</p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
