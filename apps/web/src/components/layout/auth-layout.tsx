import type { ReactNode } from "react"
import { CheckCircle2, Smartphone, TrendingUp } from "lucide-react"
import { Link } from "react-router-dom"

import { BrandLogo } from "@/features/landing/components/brand-logo"

interface AuthLayoutProps {
  alternateLinkLabel: string
  alternateLinkTo: string
  alternatePrompt: string
  children: ReactNode
  description: string
  eyebrow: string
  title: string
}

const productHighlights = [
  { icon: TrendingUp, text: "Organize oportunidades de receita adicional" },
  { icon: Smartphone, text: "Envie uma experiência simples para o celular" },
  { icon: CheckCircle2, text: "Acompanhe cada decisão com clareza" },
]

export function AuthLayout({
  alternateLinkLabel,
  alternateLinkTo,
  alternatePrompt,
  children,
  description,
  eyebrow,
  title,
}: AuthLayoutProps) {
  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
      <aside className="relative hidden overflow-hidden bg-primary px-10 py-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between xl:px-16">
        <BrandLogo inverted />

        <div className="max-w-lg">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Valor em cada atendimento
          </p>
          <h2 className="mt-4 text-balance text-4xl font-bold leading-tight tracking-tight">
            Ofereça o serviço certo no momento em que ele faz sentido.
          </h2>
          <p className="mt-5 text-lg leading-8 text-primary-foreground/75">
            Uma experiência humanizada para o prestador apresentar extras e para o cliente decidir
            sem ruído.
          </p>

          <ul className="mt-10 space-y-4">
            {productHighlights.map((highlight) => {
              const Icon = highlight.icon

              return (
                <li className="flex items-center gap-3 text-sm text-primary-foreground/85" key={highlight.text}>
                  <span className="grid size-9 place-items-center rounded-lg bg-primary-foreground/10">
                    <Icon aria-hidden="true" className="size-4 text-emerald-300" />
                  </span>
                  {highlight.text}
                </li>
              )
            })}
          </ul>
        </div>

        <p className="text-sm text-primary-foreground/60">
          ExtraOK · Gestão segura de serviços extras
        </p>
      </aside>

      <section className="flex min-w-0 flex-col px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
        <div className="flex items-center justify-between gap-4 lg:justify-end">
          <BrandLogo className="lg:hidden" />
          <p className="text-right text-sm text-muted-foreground">
            {alternatePrompt}{" "}
            <Link
              className="font-semibold text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              to={alternateLinkTo}
            >
              {alternateLinkLabel}
            </Link>
          </p>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 sm:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</p>
          <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-pretty leading-7 text-muted-foreground">{description}</p>
          <div className="mt-7">{children}</div>
        </div>
      </section>
    </main>
  )
}
