import { apiPath, apiRequest } from '@/lib/http-client'
import type { ApprovalService, PublicApproval } from './contracts'

export const approvalService: ApprovalService = {
  getByToken(token, options) {
    return apiRequest<PublicApproval>(`/public/approvals/${apiPath(token)}`, {
      signal: options?.signal,
    })
  },

  respond(token, extraId, decision) {
    return apiRequest<PublicApproval>(
      `/public/approvals/${apiPath(token)}/extras/${apiPath(extraId)}/decision`,
      { method: 'POST', body: { decision } },
    )
  },
}
