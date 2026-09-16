import { downloadFile } from '@/lib/download'
import { apiRequest } from '@/lib/http-client'
import type { JobsReport, ReportFilters } from '@/features/reports/report.types'

function query(filters: ReportFilters) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to, status: filters.status, page: String(filters.page) })
  if (filters.clientId) params.set('clientId', filters.clientId)
  return params.toString()
}

export const reportsService = {
  jobs(filters: ReportFilters, signal?: AbortSignal) {
    return apiRequest<JobsReport>(`/reports/jobs?${query(filters)}`, { signal })
  },
  downloadCsv(filters: ReportFilters) {
    return downloadFile(`/reports/jobs.csv?${query({ ...filters, page: 1 })}`, `atendimentos-${filters.from}-${filters.to}.csv`)
  },
}
