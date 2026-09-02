import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { CreateExtraInput, UpdateExtraInput } from '@/services/contracts'
import { extrasService } from '@/services/extras.service'

function invalidateExtraContext(queryClient: ReturnType<typeof useQueryClient>, jobId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.extras.byJob(jobId) })
  void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(jobId) })
  void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all })
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary })
  void queryClient.invalidateQueries({ queryKey: queryKeys.approval.all })
}

export function useExtras(jobId: string) {
  return useQuery({
    queryKey: queryKeys.extras.byJob(jobId),
    queryFn: ({ signal }) => extrasService.listByJob(jobId, { signal }),
    enabled: Boolean(jobId),
  })
}

export function useCreateExtra() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateExtraInput) => extrasService.create(input),
    onSuccess: (extra) => invalidateExtraContext(queryClient, extra.jobId),
  })
}

export function useUpdateExtra() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; jobId: string; input: UpdateExtraInput }) =>
      extrasService.update(id, input),
    onSuccess: (extra) => invalidateExtraContext(queryClient, extra.jobId),
  })
}

export function useDeleteExtra() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; jobId: string }) => extrasService.remove(id),
    onSuccess: (_data, variables) => invalidateExtraContext(queryClient, variables.jobId),
  })
}
