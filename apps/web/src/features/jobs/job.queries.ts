import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { CreateJobInput } from '@/services/contracts'
import { jobsService } from '@/services/jobs.service'
import type { JobFilters } from '@/services/contracts'
import type { JobStatus } from '@/types/domain'

export function useJobs(filters: JobFilters = {}) {
  return useQuery({
    queryKey: queryKeys.jobs.list(filters),
    queryFn: ({ signal }) => jobsService.list(filters, { signal }),
  })
}

export function useJob(id: string) {
  return useQuery({
    queryKey: queryKeys.jobs.detail(id),
    queryFn: ({ signal }) => jobsService.getById(id, { signal }),
    enabled: Boolean(id),
  })
}

export function useCreateJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateJobInput) => jobsService.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary })
    },
  })
}

export function useUpdateJobStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: JobStatus }) =>
      jobsService.updateStatus(id, status),
    onSuccess: (job) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(job.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary })
    },
  })
}

export function useCreateApprovalLink() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (jobId: string) => jobsService.createApprovalLink(jobId),
    onSuccess: (_link, jobId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(jobId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.billing.summary })
    },
  })
}
