export type PlanId = 'free' | 'pro' | 'business'
export type PaidPlanId = Exclude<PlanId, 'free'>
export interface Plan {
  id: PlanId
  name: string
  priceCents: number
  jobLimit: number
  durationDays: number | null
}
export interface PlansCatalog {
  plans: Plan[]
  pixAvailable: boolean
}
export type PaymentStatus = 'creating' | 'pending' | 'approved' | 'expired' | 'cancelled' | 'rejected' | 'refunded'
export interface BillingPayment {
  id: string
  planId: PaidPlanId
  priceCents: number
  status: PaymentStatus
  createdAt: string
  approvedAt: string | null
  expiresAt: string
  qrCode: string | null
  qrCodeBase64: string | null
}
export interface BillingSummary extends PlansCatalog {
  current: {
    planId: PlanId
    startsAt: string
    endsAt: string
    limit: number
    used: number
    remaining: number
  }
  upcoming: { id: string; plan: PaidPlanId; startsAt: string; endsAt: string; jobLimit: number }[]
  nextPurchaseStartsAt: string
  payments: BillingPayment[]
}
