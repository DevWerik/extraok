import type { ExtraStatus } from '@/types/domain'

export const extraStatusMeta: Record<
  ExtraStatus,
  { label: string; className: string }
> = {
  pending: {
    label: 'Pendente',
    className: 'border-warning/20 bg-warning-soft text-warning',
  },
  approved: {
    label: 'Aprovado',
    className: 'border-success/20 bg-success-soft text-success',
  },
  rejected: {
    label: 'Recusado',
    className: 'border-destructive/20 bg-destructive-soft text-destructive',
  },
}
