import type * as React from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface LoadingStateProps extends React.ComponentProps<'div'> {
  label?: string
  rows?: number
  showHeader?: boolean
}

function LoadingState({
  label = 'Carregando conteúdo',
  rows = 3,
  showHeader = true,
  className,
  ...props
}: LoadingStateProps) {
  return (
    <div
      data-slot="loading-state"
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('w-full space-y-4', className)}
      {...props}
    >
      <span className="sr-only">{label}</span>
      {showHeader && (
        <div className="flex items-center justify-between gap-4" aria-hidden="true">
          <div className="space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-64 max-w-[70vw]" />
          </div>
          <Skeleton className="hidden h-10 w-32 sm:block" />
        </div>
      )}
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: Math.max(1, rows) }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-lg border border-border p-4"
          >
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5 min-w-28" />
              <Skeleton className="h-3 w-3/5 min-w-40" />
            </div>
            <Skeleton className="hidden h-6 w-20 sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}

export { LoadingState, type LoadingStateProps }
