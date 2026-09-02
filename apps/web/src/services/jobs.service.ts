import { apiPath, apiRequest } from '@/lib/http-client'
import type { Job } from '@/types/domain'
import type {
  ApprovalLinkResult,
  CreateJobInput,
  JobDetails,
  JobListItem,
  JobsService,
} from './contracts'

export const jobsService: JobsService = {
  list(filters = {}, options) {
    const query = new URLSearchParams()
    if (filters.search?.trim()) query.set('search', filters.search.trim())
    if (filters.status && filters.status !== 'all') query.set('status', filters.status)
    const suffix = query.size ? `?${query.toString()}` : ''

    return apiRequest<JobListItem[]>(`/jobs${suffix}`, { signal: options?.signal })
  },

  getById(id, options) {
    return apiRequest<JobDetails>(`/jobs/${apiPath(id)}`, { signal: options?.signal })
  },

  create(input: CreateJobInput) {
    return apiRequest<Job>('/jobs', { method: 'POST', body: input })
  },

  updateStatus(id, status) {
    return apiRequest<Job>(`/jobs/${apiPath(id)}/status`, {
      method: 'PATCH',
      body: { status },
    })
  },

  createApprovalLink(jobId) {
    return apiRequest<ApprovalLinkResult>(`/jobs/${apiPath(jobId)}/approval-links`, {
      method: 'POST',
    })
  },
}
