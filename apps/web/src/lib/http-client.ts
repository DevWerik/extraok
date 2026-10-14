/// <reference types="vite/client" />
import { ServiceError, type ServiceErrorCode } from '../services/errors.ts'

const configuredBaseUrl = import.meta.env?.VITE_API_URL?.trim()
const API_BASE_URL = (configuredBaseUrl || '/api/v1').replace(/\/$/, '')
const readCooldowns = new Map<string, ServiceError>()

function retryDeadline(response: Response): number | undefined {
  if (response.status !== 429 && response.status !== 503) return undefined
  const now = Date.now()
  const value = response.headers.get('Retry-After')?.trim()
  if (value) {
    const deadline = /^\d+$/.test(value) ? now + Number(value) * 1_000 : Date.parse(value)
    if (Number.isFinite(deadline) && deadline >= now) return deadline
  }
  return now + (response.status === 429 ? 30_000 : 15_000)
}

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
  responseType?: 'json' | 'blob'
}

const serviceErrorCodes = new Set<ServiceErrorCode>([
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION',
  'PASSWORD_REUSED',
  'FORBIDDEN_OPERATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'NETWORK_ERROR',
  'INTERNAL_ERROR',
  'GONE',
  'PLAN_LIMIT_REACHED',
  'PLAN_FEATURE_REQUIRED',
  'BILLING_EXEMPT',
  'PAYMENT_UNAVAILABLE',
  'PAYMENT_MISMATCH',
  'PAYER_DATA_REQUIRED',
  'PAYMENT_RETRY_LATER',
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
  if ([502, 503, 504].includes(status)) return 'O ExtraOK está temporariamente indisponível. Aguarde um momento e tente novamente.'
  return 'Não foi possível concluir a solicitação.'
}

export async function apiRequest<T>(
  path: string,
  { body, headers, skipAuthRedirect = false, responseType = 'json', ...options }: ApiRequestOptions = {},
): Promise<T> {
  const isRead = !options.method || options.method.toUpperCase() === 'GET'
  // Share the pause across components that request the same resource, including
  // remounts and manual refetches. Never replay a mutation automatically.
  for (const [key, error] of readCooldowns) {
    if ((error.retryAt ?? 0) <= Date.now()) readCooldowns.delete(key)
  }
  const cooldown = isRead ? readCooldowns.get(path) : undefined
  options.signal?.throwIfAborted()
  if (cooldown) throw cooldown

  const signal = isRead && responseType === 'json'
    ? AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(20_000)])
    : options.signal
  const requestHeaders = new Headers(headers)
  requestHeaders.set('Accept', responseType === 'blob' ? 'application/pdf, text/csv, application/json' : 'application/json')
  requestHeaders.set('X-Requested-With', 'ExtraOK-Web')

  if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      headers: requestHeaders,
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw error

    throw new ServiceError(
      signal?.aborted
        ? 'O ExtraOK demorou para responder. Aguarde um momento e tente novamente.'
        : 'Não foi possível conectar ao ExtraOK. Verifique sua conexão.',
      'NETWORK_ERROR',
      0,
    )
  }

  if (response.status === 204) return undefined as T
  if (response.ok && responseType === 'blob') return await response.blob() as T

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const payload = isJson ? ((await response.json().catch((error: unknown) => {
    if (options.signal?.aborted) throw error
    return undefined
  })) as T | ApiErrorPayload | undefined) : undefined

  if (!response.ok) {
    const apiError = (payload as ApiErrorPayload | undefined)?.error
    const code = serviceErrorCodes.has(apiError?.code as ServiceErrorCode)
      ? (apiError?.code as ServiceErrorCode)
      : fallbackCode(response.status)

    if (response.status === 401 && !skipAuthRedirect) {
      window.dispatchEvent(new Event('extraok:unauthorized'))
    }

    const error = new ServiceError(
      apiError?.message || fallbackMessage(response.status),
      code,
      response.status,
      { fields: apiError?.fields, requestId: apiError?.requestId, retryAt: retryDeadline(response) },
    )
    if (isRead && error.retryAt) readCooldowns.set(path, error)
    throw error
  }

  if (payload === undefined) {
    throw new ServiceError('O ExtraOK retornou uma resposta inválida. Tente novamente em instantes.', 'INTERNAL_ERROR', response.status)
  }
  return payload as T
}

export function apiPath(segment: string): string {
  return encodeURIComponent(segment)
}
