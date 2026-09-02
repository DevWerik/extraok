import {
  CheckCircle2Icon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  XCircleIcon,
} from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

function Toaster({
  position = 'top-right',
  closeButton = true,
  ...props
}: ToasterProps) {
  return (
    <Sonner
      data-slot="toaster"
      theme="light"
      position={position}
      closeButton={closeButton}
      icons={{
        success: <CheckCircle2Icon className="size-4" aria-hidden="true" />,
        info: <InfoIcon className="size-4" aria-hidden="true" />,
        warning: <TriangleAlertIcon className="size-4" aria-hidden="true" />,
        error: <XCircleIcon className="size-4" aria-hidden="true" />,
        loading: (
          <LoaderCircleIcon
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ),
      }}
      toastOptions={{
        classNames: {
          toast:
            'group toast border-border bg-background text-foreground shadow-lg',
          title: 'font-semibold',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
          closeButton:
            'border-border bg-background text-muted-foreground hover:text-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
