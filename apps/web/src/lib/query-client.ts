import { QueryClient } from '@tanstack/react-query'
import { queryRetryDelay, shouldRetryQuery } from './query-retry'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelay,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})
