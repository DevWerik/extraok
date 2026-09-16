import type { BillingSummary, PlanFeatures } from './billing.types'

export function hasPlanFeature(summary: BillingSummary | undefined, feature: keyof PlanFeatures, now = Date.now()): boolean {
  if (!summary?.current.features?.[feature]) return false
  if (summary.current.billingExempt) return true
  return Date.parse(summary.current.startsAt) <= now && Date.parse(summary.current.endsAt) > now
}
