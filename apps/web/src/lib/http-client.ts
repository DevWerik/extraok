import { ServiceError, type ServiceErrorCode } from '@/services/errors'

const configuredBaseUrl = import.meta.env.VITE_API_URL?.trim()
const API_BASE_URL = (configuredBaseUrl || '/api/v1').replace(/\/$/, '')

interface ApiErrorPayload {
  error?: {
    code?: string
    message?: string
    fields?: Record<string, string[]>
    requestId?: string
  }
}

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  skipAuthRedirect?: boolean
}

const serviceErrorCodes = new Set<ServiceErrorCode>([
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION',
  'FORBIDDEN_OPERATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'NETWORK_ERROR',
  'INTERNAL_ERROR',
  'GONE',
  'PLAN_LIMIT_REACHED',
  'PAYMENT_UNAVAILABLE',
  'PAYMENT_MISMATCH',
])

function fallbackCode(status: number): ServiceErrorCode {
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status === 410) return 'GONE'
  if (status === 429) return 'RATE_LIMITED'
  if (status >= 400 && status < 500) return 'VALIDATION'
  return 'INTERNAL_ERROR'
}

function fallbackMessage(status: number): string {
  if (status === 401) return 'Sua sessão expirou. Entre novamente.'
  if (status === 403) return 'Você não tem permissão para realizar esta ação.'
  if (status === 404) return 'O recurso solicitado não foi encontrado.'
  if (status === 429) return 'Muitas tentativas. Aguarde um momento e tente novamente.'
  return 'Não foi possível concluir a solicitação.'
}

export async function apiRequest<T>(
  path: string,
  { body, headers, skipAuthRedirect = false, ...options }: ApiRequestOptions = {},
): Promise<T> {
  const requestHeaders = new Headers(headers)
  requestHeaders.set('Accept', 'application/json')
  requestHeaders.set('X-Requested-With', 'ExtraOK-Web')

  if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      headers: requestHeaders,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error

    throw new ServiceError(
      'Não foi possível conectar ao ExtraOK. Verifique sua conexão.',
      'NETWORK_ERROR',
      0,
    )
  }

  if (response.status === 204) return undefined as T

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const payload = isJson ? ((await response.json()) as T | ApiErrorPayload) : undefined

  if (!response.ok) {
    const apiError = (payload as ApiErrorPayload | undefined)?.error
    const code = serviceErrorCodes.has(apiError?.code as ServiceErrorCode)
      ? (apiError?.code as ServiceErrorCode)
      : fallbackCode(response.status)

    if (response.status === 401 && !skipAuthRedirect) {
      window.dispatchEvent(new Event('extraok:unauthorized'))
    }

    throw new ServiceError(
      apiError?.message || fallbackMessage(response.status),
      code,
      response.status,
      { fields: apiError?.fields, requestId: apiError?.requestId },
    )
  }

  return payload as T
}

export function apiPath(segment: string): string {
  return encodeURIComponent(segment)
}
