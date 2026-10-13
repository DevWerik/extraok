import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { billingService } from '@/services/billing.service'
import type { BillingPayment, BillingSummary } from './billing.types'
import { currentPayment } from './billing.utils'

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
export function useBillingPayment(id: string | null, summaryPayment?: BillingPayment) {
  return useQuery({
    queryKey: queryKeys.billing.payment(id ?? ''),
    queryFn: ({ signal }) => billingService.payment(id!, signal),
    enabled: Boolean(id), staleTime: 0, gcTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => ['creating', 'pending'].includes(currentPayment(query.state.data, summaryPayment)?.status ?? '') ? 5_000 : false,
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

export function useCancelPayment() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: billingService.cancelPayment, retry: false,
    onMutate: async (id) => {
      await Promise.all([
        client.cancelQueries({ queryKey: queryKeys.billing.payment(id) }),
        client.cancelQueries({ queryKey: queryKeys.billing.summary }),
      ])
    },
    onSuccess: async (payment) => {
      // A poll may have started during cancellation. Do not let its stale
      // response restore the old checkout or keep another plan blocked.
      await Promise.all([
        client.cancelQueries({ queryKey: queryKeys.billing.payment(payment.id) }),
        client.cancelQueries({ queryKey: queryKeys.billing.summary }),
      ])
      client.setQueryData(queryKeys.billing.payment(payment.id), payment)
      client.setQueryData<BillingSummary>(queryKeys.billing.summary, (summary) => summary && ({
        ...summary, payments: summary.payments.map((entry) => entry.id === payment.id ? payment : entry),
      }))
    },
    onSettled: async (_payment, _error, id) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.billing.summary }),
        client.invalidateQueries({ queryKey: queryKeys.billing.payment(id) }),
      ])
    },
  })
}
