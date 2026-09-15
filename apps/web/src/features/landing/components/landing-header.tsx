import { ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { BrandLogo } from "@/features/landing/components/brand-logo"

const navigationItems = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#beneficios", label: "Benefícios" },
  { href: "#exemplo", label: "Exemplo" },
  { href: "#planos", label: "Planos" },
]

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 px-4 py-3 sm:px-6 lg:px-8">
        <BrandLogo />

        <nav
          aria-label="Navegação principal"
          className="order-3 mt-3 flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-border pt-3 text-sm font-medium text-muted-foreground lg:order-none lg:mt-0 lg:w-auto lg:border-0 lg:pt-0"
        >
          {navigationItems.map((item) => (
            <a
              className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link to="/login">Entrar</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex" size="sm">
            <Link to="/cadastro">
              Criar conta
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
