export type PlanId = 'free' | 'pro' | 'business'
export type PaidPlanId = Exclude<PlanId, 'free'>
export interface PlanFeatures {
  pdfExport: boolean
  advancedReports: boolean
  csvExport: boolean
}
export interface Plan {
  id: PlanId
  name: string
  priceCents: number
  jobLimit: number
  durationDays: number | null
  features: PlanFeatures
  benefits: string[]
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
export type BillingCurrent = {
  planId: PlanId
  features: PlanFeatures
  used: number
} & ({
    billingExempt: false
    startsAt: string
    endsAt: string
    limit: number
    remaining: number
  } | {
    billingExempt: true
    startsAt: null
    endsAt: null
    limit: null
    remaining: null
  })

export interface BillingSummary extends PlansCatalog {
  current: BillingCurrent
  upcoming: { id: string; plan: PaidPlanId; startsAt: string; endsAt: string; jobLimit: number }[]
  nextPurchaseStartsAt: string | null
  payments: BillingPayment[]
}
