interface QueryStatus {
  state: { status: 'pending' | 'error' | 'success' }
}

export function canRefreshQuery(query: QueryStatus): boolean {
  return query.state.status !== 'error'
}

// An error stays visible until the user requests another attempt. Mounting,
// focusing or reconnecting must not silently restart a failed request.
export const manualRetryOptions = {
  retry: false,
  retryOnMount: false,
  refetchOnMount: canRefreshQuery,
  refetchOnWindowFocus: false,
  refetchOnReconnect: canRefreshQuery,
} as const
