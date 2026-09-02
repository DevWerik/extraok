import { Check, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface BrandProps {
  className?: string
  inverse?: boolean
  to?: string
}

export function Brand({ className, inverse = false, to = '/' }: BrandProps) {
  const content = (
    <>
      <span
        className={cn(
          'relative grid size-9 shrink-0 place-items-center rounded-xl',
          inverse ? 'bg-white text-primary' : 'bg-primary text-white',
        )}
        aria-hidden="true"
      >
        <Check className="size-5" strokeWidth={2.8} />
        <Plus className="absolute -right-1 -top-1 size-4 rounded-full bg-success p-0.5 text-white" strokeWidth={3} />
      </span>
      <span className={cn('text-xl font-extrabold tracking-tight', inverse ? 'text-white' : 'text-primary')}>
        Extra<span className="text-success">OK</span>
      </span>
    </>
  )

  return (
    <Link
      to={to}
      className={cn('inline-flex items-center gap-2.5 rounded-xl', className)}
      aria-label="ExtraOK — página inicial"
    >
      {content}
    </Link>
  )
}
