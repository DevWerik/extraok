import { CheckCheck } from "lucide-react"
import { Link } from "react-router-dom"

interface BrandLogoProps {
  className?: string
  inverted?: boolean
}

export function BrandLogo({ className = "", inverted = false }: BrandLogoProps) {
  return (
    <Link
      aria-label="ExtraOK — ir para a página inicial"
      className={`inline-flex items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
      to="/"
    >
      <span
        aria-hidden="true"
        className={`grid size-9 place-items-center rounded-xl ${
          inverted
            ? "bg-primary-foreground text-primary"
            : "bg-primary text-primary-foreground"
        }`}
      >
        <CheckCheck className="size-5" strokeWidth={2.5} />
      </span>
      <span className={inverted ? "text-primary-foreground" : "text-foreground"}>
        Extra<span className={inverted ? "text-emerald-300" : "text-emerald-600"}>OK</span>
      </span>
    </Link>
  )
}
