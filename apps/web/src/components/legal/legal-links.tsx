import { Link } from 'react-router-dom'

export function LegalLinks() {
  const className = 'rounded-sm underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return (
    <nav aria-label="Termos e privacidade" className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
      <Link className={className} to="/termos">Termos de Uso</Link>
      <Link className={className} to="/privacidade">Política de Privacidade</Link>
    </nav>
  )
}
