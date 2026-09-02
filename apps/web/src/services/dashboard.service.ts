import { apiRequest } from '@/lib/http-client'
import type { DashboardService, DashboardSummary } from './contracts'

export const dashboardService: DashboardService = {
  getSummary(options) {
    return apiRequest<DashboardSummary>('/dashboard/summary', {
      signal: options?.signal,
    })
  },
}
