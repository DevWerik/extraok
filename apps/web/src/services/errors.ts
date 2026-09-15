export type ServiceErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'FORBIDDEN_OPERATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR'
  | 'GONE'
  | 'PLAN_LIMIT_REACHED'
  | 'PAYMENT_UNAVAILABLE'
  | 'PAYMENT_MISMATCH'

export class ServiceError extends Error {
  readonly code: ServiceErrorCode
  readonly status: number
  readonly fields?: Record<string, string[]>
  readonly requestId?: string

  constructor(
    message: string,
    code: ServiceErrorCode,
    status: number,
    options: {
      fields?: Record<string, string[]>
      requestId?: string
    } = {},
  ) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
    this.status = status
    this.fields = options.fields
    this.requestId = options.requestId
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError
}
