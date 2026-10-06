import type { BillingPayment, PaymentStatus, PlanId } from './billing.types.ts'

export const paymentLabels: Record<PaymentStatus, string> = {
  creating: 'Preparando Pix', pending: 'Aguardando pagamento', approved: 'Pagamento confirmado',
  expired: 'Pix expirado', cancelled: 'Cancelado', rejected: 'Não aprovado', refunded: 'Reembolsado',
}
export function recoverPaymentAttempt(payments: BillingPayment[], key: string, planId: PlanId) {
  // A failed POST can still have been reconciled by the API/webhook. Only the
  // same attempt may replace its error; an older charge must never do so.
  return payments.find((payment) => payment.id === key && payment.planId === planId && payment.status !== 'creating')
}
export function currentPayment(queried: BillingPayment | undefined, summary: BillingPayment | undefined) {
  if (!queried || !summary || queried.id !== summary.id) return queried ?? summary
  // A failed poll retains its previous data. Do not let that cached state hide
  // a confirmation, refund or rejection already received in the summary.
  if (summary.status === 'refunded') return summary
  if (queried.status === 'refunded') return queried
  if (summary.status === 'approved') return summary
  if (queried.status === 'approved') return queried
  if (['creating', 'pending'].includes(queried.status) && !['creating', 'pending'].includes(summary.status)) return summary
  return queried
}
export function visiblePaymentStatus(status: PaymentStatus, expiresAt: string, now: number): PaymentStatus {
  return (status === 'creating' || status === 'pending') && Date.parse(expiresAt) <= now ? 'expired' : status
}
export function pixCountdown(expiresAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
