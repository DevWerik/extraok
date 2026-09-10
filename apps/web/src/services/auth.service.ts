import { apiRequest } from '@/lib/http-client'
import type { Session } from '@/types/domain'
import type { AuthService, PasswordResetRequestResult, PasswordResetVerifyResult } from './contracts'
import { isServiceError } from './errors'

export const authService: AuthService = {
  async getSession(options) {
    try {
      return await apiRequest<Session>('/auth/session', {
        signal: options?.signal,
        skipAuthRedirect: true,
      })
    } catch (error) {
      if (isServiceError(error) && error.code === 'UNAUTHORIZED') return null
      throw error
    }
  },

  signIn(input) {
    return apiRequest<Session>('/auth/login', {
      method: 'POST',
      body: input,
      skipAuthRedirect: true,
    })
  },

  signUp(input) {
    return apiRequest<Session>('/auth/register', {
      method: 'POST',
      body: input,
      skipAuthRedirect: true,
    })
  },

  signOut() {
    return apiRequest<void>('/auth/logout', { method: 'POST' })
  },

  requestPasswordReset(input) {
    return apiRequest<PasswordResetRequestResult>('/auth/password-reset/request', {
      method: 'POST',
      body: input,
      skipAuthRedirect: true,
    })
  },

  verifyPasswordReset(input) {
    return apiRequest<PasswordResetVerifyResult>('/auth/password-reset/verify', {
      method: 'POST',
      body: input,
      skipAuthRedirect: true,
    })
  },

  confirmPasswordReset(input) {
    return apiRequest<void>('/auth/password-reset/confirm', {
      method: 'POST',
      body: input,
      skipAuthRedirect: true,
    })
  },
}
