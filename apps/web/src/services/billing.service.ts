import { apiPath, apiRequest } from '@/lib/http-client'
import type { BillingPayment, BillingSummary, PaidPlanId, PlansCatalog } from '@/features/billing/billing.types'

export const billingService = {
  plans(signal?: AbortSignal) {
    return apiRequest<PlansCatalog>('/billing/plans', { signal, skipAuthRedirect: true })
  },
  summary(signal?: AbortSignal) {
    return apiRequest<BillingSummary>('/billing', { signal })
  },
  createPayment(input: { planId: PaidPlanId; cpf: string; idempotencyKey: string }) {
    return apiRequest<BillingPayment>('/billing/payments', { method: 'POST', body: input })
  },
  payment(id: string, signal?: AbortSignal) {
    return apiRequest<BillingPayment>(`/billing/payments/${apiPath(id)}`, { signal })
  },
}
