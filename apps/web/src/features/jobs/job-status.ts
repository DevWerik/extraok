import type { JobStatus } from '@/types/domain'

export const jobStatusMeta: Record<
  JobStatus,
  { label: string; className: string }
> = {
  scheduled: {
    label: 'Agendado',
    className: 'border-info/20 bg-info-soft text-info',
  },
  in_progress: {
    label: 'Em andamento',
    className: 'border-warning/20 bg-warning-soft text-warning',
  },
  completed: {
    label: 'Finalizado',
    className: 'border-success/20 bg-success-soft text-success',
  },
  cancelled: {
    label: 'Cancelado',
    className: 'border-destructive/20 bg-destructive-soft text-destructive',
  },
}
