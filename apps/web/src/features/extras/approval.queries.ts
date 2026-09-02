import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { approvalService } from '@/services/approval.service'
import type { ApprovalDecision } from '@/services/contracts'

export function useApproval(token: string) {
  return useQuery({
    queryKey: queryKeys.approval.detail(token),
    queryFn: ({ signal }) => approvalService.getByToken(token, { signal }),
    enabled: Boolean(token),
  })
}

export function useRespondToExtra() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      token,
      extraId,
      decision,
    }: {
      token: string
      extraId: string
      decision: ApprovalDecision
    }) => approvalService.respond(token, extraId, decision),
    onSuccess: (approval, variables) => {
      queryClient.setQueryData(queryKeys.approval.detail(variables.token), approval)
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary })
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.extras.all })
    },
  })
}
