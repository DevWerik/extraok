export const JOB_STATUSES = [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
] as const

export type JobStatus = (typeof JOB_STATUSES)[number]

export const EXTRA_STATUSES = ['pending', 'approved', 'rejected'] as const

export type ExtraStatus = (typeof EXTRA_STATUSES)[number]

export interface User {
  id: string
  name: string
  businessName: string
  email: string
  phone: string
  createdAt: string
}

export interface Session {
  user: User
  issuedAt: string
  expiresAt: string
}

export interface Client {
  id: string
  name: string
  phone: string
  email: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface Job {
  id: string
  clientId: string
  title: string
  description: string
  scheduledAt: string
  status: JobStatus
  createdAt: string
  updatedAt: string
}

export interface Extra {
  id: string
  jobId: string
  title: string
  description: string
  /** Monetary values are always stored as integer cents. */
  priceCents: number
  status: ExtraStatus
  createdAt: string
  updatedAt: string
  respondedAt: string | null
}
