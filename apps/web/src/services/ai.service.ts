import { apiRequest } from '@/lib/http-client'

export interface DescriptionInput {
  title: string
  description: string
}

export const aiService = {
  capabilities(signal?: AbortSignal) {
    return apiRequest<{ descriptionsEnabled: boolean }>('/ai/capabilities', { signal })
  },
  generateDescription(input: DescriptionInput, signal: AbortSignal) {
    return apiRequest<{ description: string }>('/ai/extra-description', {
      method: 'POST',
      body: input,
      signal,
    })
  },
}
