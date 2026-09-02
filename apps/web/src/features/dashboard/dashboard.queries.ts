import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { dashboardService } from '@/services/dashboard.service'

export function useDashboardSummary() {
  return useQuery({
    queryKey: queryKeys.dashboard.summary,
    queryFn: ({ signal }) => dashboardService.getSummary({ signal }),
  })
}
