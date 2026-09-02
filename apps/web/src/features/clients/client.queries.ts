import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { clientsService } from '@/services/clients.service'
import type { ClientFilters } from '@/services/contracts'

export function useClients(filters: ClientFilters = {}) {
  return useQuery({
    queryKey: queryKeys.clients.list(filters),
    queryFn: ({ signal }) => clientsService.list(filters, { signal }),
  })
}

export function useClient(id: string) {
  return useQuery({
    queryKey: queryKeys.clients.detail(id),
    queryFn: ({ signal }) => clientsService.getById(id, { signal }),
    enabled: Boolean(id),
  })
}

export function useCreateClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: clientsService.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.clients.all }),
  })
}

export function useUpdateClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: Parameters<typeof clientsService.update> extends [string, infer Input] ? { id: string; input: Input } : never) =>
      clientsService.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.clients.all }),
  })
}

export function useDeleteClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: clientsService.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.clients.all }),
  })
}
