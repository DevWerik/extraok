import { Link } from "react-router-dom"

import { BrandLogo } from "@/features/landing/components/brand-logo"
import { LegalLinks } from '@/components/legal/legal-links'

export function LandingFooter() {
  return (
    <footer className="border-t border-border px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <BrandLogo />
        <p>© {new Date().getFullYear()} ExtraOK. Serviços extras com aprovação clara.</p>
        <nav aria-label="Links do rodapé" className="flex items-center gap-4">
          <Link className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to="/login">
            Entrar
          </Link>
          <Link className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to="/cadastro">
            Criar conta
          </Link>
        </nav>
      </div>
      <div className="mx-auto mt-6 max-w-7xl border-t pt-5"><LegalLinks /></div>
    </footer>
  )
}
