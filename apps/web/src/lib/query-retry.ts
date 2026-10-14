import { isServiceError } from '../services/errors.ts'

export function queryRetryDelay(_failureCount: number, error: unknown): number {
  if (isServiceError(error)) {
    const minimum = error.status === 0 || [502, 503, 504].includes(error.status) ? 15_000 : 1_000
    return Math.max(minimum, (error.retryAt ?? 0) - Date.now())
  }
  return 1_000
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isServiceError(error) && error.status >= 400 && error.status < 500) return false
  // Keep retries bounded, including when the server requests a long pause.
  return failureCount < 1 && queryRetryDelay(failureCount, error) <= 60_000
}
