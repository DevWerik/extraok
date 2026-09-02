import type { ClientFilters, JobFilters } from '@/services/contracts'

export const queryKeys = {
  auth: {
    session: ['auth', 'session'] as const,
  },
  dashboard: {
    summary: ['dashboard', 'summary'] as const,
  },
  clients: {
    all: ['clients'] as const,
    list: (filters: ClientFilters = {}) => ['clients', 'list', filters] as const,
    detail: (id: string) => ['clients', 'detail', id] as const,
  },
  jobs: {
    all: ['jobs'] as const,
    list: (filters: JobFilters = {}) => ['jobs', 'list', filters] as const,
    detail: (id: string) => ['jobs', 'detail', id] as const,
  },
  extras: {
    all: ['extras'] as const,
    byJob: (jobId: string) => ['extras', 'job', jobId] as const,
  },
  approval: {
    all: ['approval'] as const,
    detail: (token: string) => ['approval', token] as const,
  },
}
