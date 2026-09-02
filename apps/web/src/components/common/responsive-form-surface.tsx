import { useEffect, useState, type ReactElement, type ReactNode } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const DESKTOP_SURFACE_QUERY = '(min-width: 768px)'

function useDesktopSurface() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia(DESKTOP_SURFACE_QUERY).matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_SURFACE_QUERY)
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return isDesktop
}

interface ResponsiveFormSurfaceProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  children: ReactNode
  trigger?: ReactElement
  footer?: ReactNode
  contentClassName?: string
  bodyClassName?: string
  footerClassName?: string
}

function ResponsiveFormSurface({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
  footer,
  contentClassName,
  bodyClassName,
  footerClassName,
}: ResponsiveFormSurfaceProps) {
  const isDesktop = useDesktopSurface()

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
        <DialogContent className={contentClassName}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className={cn('min-w-0', bodyClassName)}>{children}</div>
          {footer && (
            <DialogFooter className={footerClassName}>{footer}</DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent
        side="bottom"
        className={cn('overflow-hidden', contentClassName)}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div
          className={cn(
            'min-h-0 min-w-0 flex-1 overflow-y-auto px-5 pb-5',
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer && (
          <SheetFooter className={footerClassName}>{footer}</SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

export {
  ResponsiveFormSurface,
  type ResponsiveFormSurfaceProps,
}
