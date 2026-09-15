import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { billingService } from '@/services/billing.service'

export function usePlans() {
  return useQuery({ queryKey: queryKeys.billing.plans, queryFn: ({ signal }) => billingService.plans(signal) })
}
export function useBilling() {
  return useQuery({
    queryKey: queryKeys.billing.summary,
    queryFn: ({ signal }) => billingService.summary(signal),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
}
export function useBillingPayment(id: string | null) {
  return useQuery({
    queryKey: queryKeys.billing.payment(id ?? ''),
    queryFn: ({ signal }) => billingService.payment(id!, signal),
    enabled: Boolean(id), staleTime: 0, gcTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => ['creating', 'pending'].includes(query.state.data?.status ?? '') ? 5_000 : false,
  })
}
export function useCreatePayment() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: billingService.createPayment, retry: false, gcTime: 0,
    onSuccess: (payment) => client.setQueryData(queryKeys.billing.payment(payment.id), payment),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.billing.summary }),
  })
}
