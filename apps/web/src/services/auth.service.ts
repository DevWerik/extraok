import { apiRequest } from '@/lib/http-client'
import type { Session } from '@/types/domain'
import type { AuthService } from './contracts'
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
}
