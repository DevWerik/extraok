import type { PaymentStatus } from './billing.types.ts'

export const paymentLabels: Record<PaymentStatus, string> = {
  creating: 'Preparando Pix', pending: 'Aguardando pagamento', approved: 'Pagamento confirmado',
  expired: 'Pix expirado', cancelled: 'Cancelado', rejected: 'Não aprovado', refunded: 'Reembolsado',
}
export function visiblePaymentStatus(status: PaymentStatus, expiresAt: string, now: number): PaymentStatus {
  return (status === 'creating' || status === 'pending') && Date.parse(expiresAt) <= now ? 'expired' : status
}
export function pixCountdown(expiresAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
