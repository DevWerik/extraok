import { apiPath, apiRequest } from '@/lib/http-client'
import type { Extra } from '@/types/domain'
import type { CreateExtraInput, ExtrasService } from './contracts'

export const extrasService: ExtrasService = {
  listByJob(jobId, options) {
    return apiRequest<Extra[]>(`/jobs/${apiPath(jobId)}/extras`, {
      signal: options?.signal,
    })
  },

  create(input: CreateExtraInput) {
    const { jobId, ...body } = input
    return apiRequest<Extra>(`/jobs/${apiPath(jobId)}/extras`, {
      method: 'POST',
      body,
    })
  },

  update(id, input) {
    return apiRequest<Extra>(`/extras/${apiPath(id)}`, {
      method: 'PATCH',
      body: input,
    })
  },

  remove(id) {
    return apiRequest<void>(`/extras/${apiPath(id)}`, { method: 'DELETE' })
  },
}
