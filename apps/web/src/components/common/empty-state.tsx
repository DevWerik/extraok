import type * as React from 'react'

import { cn } from '@/lib/utils'

interface EmptyStateProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      role="status"
      className={cn(
        'flex min-h-56 w-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center',
        className,
      )}
      {...props}
    >
      {icon && (
        <div
          data-slot="empty-state-icon"
          className="mb-4 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-5"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description && (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export { EmptyState, type EmptyStateProps }
