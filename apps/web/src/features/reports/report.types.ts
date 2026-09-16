import type { JobStatus } from '@/types/domain'

export interface ReportFilters {
  from: string
  to: string
  clientId: string
  status: JobStatus | 'all'
  page: number
}

export interface JobsReport {
  filters: Omit<ReportFilters, 'page' | 'clientId'> & { clientId: string | null }
  timeZone: string
  dateBasis: 'scheduledAt'
  generatedAt: string
  summary: {
    totalJobs: number
    approvedCents: number
    pendingCents: number
    rejectedCents: number
    approvedCount: number
    pendingCount: number
    rejectedCount: number
    approvalRate: number
  }
  page: number
  pageSize: number
  totalPages: number
  rows: {
    id: string
    title: string
    clientName: string
    scheduledAt: string
    status: JobStatus
    approvedCents: number
    pendingCents: number
    rejectedCents: number
  }[]
}
