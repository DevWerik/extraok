import { apiPath, apiRequest } from '@/lib/http-client'
import type { Client } from '@/types/domain'
import type { ClientsService } from './contracts'

export const clientsService: ClientsService = {
  list(filters = {}, options) {
    const query = new URLSearchParams()
    if (filters.search?.trim()) query.set('search', filters.search.trim())
    const suffix = query.size ? `?${query.toString()}` : ''

    return apiRequest<Client[]>(`/clients${suffix}`, { signal: options?.signal })
  },

  getById(id, options) {
    return apiRequest<Client>(`/clients/${apiPath(id)}`, { signal: options?.signal })
  },

  create(input) {
    return apiRequest<Client>('/clients', { method: 'POST', body: input })
  },

  update(id, input) {
    return apiRequest<Client>(`/clients/${apiPath(id)}`, {
      method: 'PATCH',
      body: input,
    })
  },

  remove(id) {
    return apiRequest<void>(`/clients/${apiPath(id)}`, { method: 'DELETE' })
  },
}
