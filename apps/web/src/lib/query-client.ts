import { QueryClient } from '@tanstack/react-query'
import { manualRetryOptions } from './query-retry'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      ...manualRetryOptions,
    },
    mutations: {
      retry: 0,
    },
  },
})
