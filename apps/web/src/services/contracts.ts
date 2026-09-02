import type {
  Client,
  Extra,
  ExtraStatus,
  Job,
  JobStatus,
  Session,
} from '../types/domain'

export interface RequestOptions {
  signal?: AbortSignal
}

export interface SignInInput {
  email: string
  password: string
}

export interface SignUpInput {
  name: string
  businessName: string
  email: string
  phone: string
  password: string
  acceptTerms: boolean
}

export interface ClientFilters {
  search?: string
}

export interface CreateClientInput {
  name: string
  phone: string
  email: string
  notes: string
}

export type UpdateClientInput = CreateClientInput

export interface JobFilters {
  search?: string
  status?: JobStatus | 'all'
}

export interface CreateJobInput {
  clientId: string
  title: string
  description: string
  scheduledAt: string
}

export interface CreateExtraInput {
  jobId: string
  title: string
  description: string
  priceCents: number
}

export interface UpdateExtraInput {
  title: string
  description: string
  priceCents: number
}

export type ApprovalDecision = Extract<ExtraStatus, 'approved' | 'rejected'>

export interface JobListItem extends Job {
  clientName: string
  approvedTotalCents: number
  pendingExtrasCount: number
}

export interface JobDetails {
  job: Job
  client: Client
  extras: Extra[]
  approvedTotalCents: number
  approvalLink: ApprovalLinkSummary
}

export interface ApprovalLinkSummary {
  active: boolean
  expiresAt: string | null
}

export interface ApprovalLinkResult {
  token: string
  expiresAt: string
}

export interface RevenuePoint {
  month: string
  label: string
  amountCents: number
}

export interface RecentJob extends Job {
  clientName: string
}

export interface PendingExtra extends Extra {
  jobTitle: string
  clientName: string
}

export interface DashboardSummary {
  additionalRevenueCents: number
  approvedExtrasCount: number
  pendingExtrasCount: number
  approvalRate: number
  revenueEvolution: RevenuePoint[]
  recentJobs: RecentJob[]
  awaitingResponse: PendingExtra[]
}

export interface PublicApprovalExtra {
  id: string
  title: string
  description: string
  priceCents: number
  status: ExtraStatus
  respondedAt: string | null
}

export interface PublicApproval {
  providerName: string
  businessName: string
  serviceTitle: string
  scheduledAt: string
  extras: PublicApprovalExtra[]
  approvedTotalCents: number
}

export interface AuthService {
  getSession(options?: RequestOptions): Promise<Session | null>
  signIn(input: SignInInput): Promise<Session>
  signUp(input: SignUpInput): Promise<Session>
  signOut(): Promise<void>
}

export interface ClientsService {
  list(filters?: ClientFilters, options?: RequestOptions): Promise<Client[]>
  getById(id: string, options?: RequestOptions): Promise<Client>
  create(input: CreateClientInput): Promise<Client>
  update(id: string, input: UpdateClientInput): Promise<Client>
  remove(id: string): Promise<void>
}

export interface JobsService {
  list(filters?: JobFilters, options?: RequestOptions): Promise<JobListItem[]>
  getById(id: string, options?: RequestOptions): Promise<JobDetails>
  create(input: CreateJobInput): Promise<Job>
  updateStatus(id: string, status: JobStatus): Promise<Job>
  createApprovalLink(jobId: string): Promise<ApprovalLinkResult>
}

export interface ExtrasService {
  listByJob(jobId: string, options?: RequestOptions): Promise<Extra[]>
  create(input: CreateExtraInput): Promise<Extra>
  update(id: string, input: UpdateExtraInput): Promise<Extra>
  remove(id: string): Promise<void>
}

export interface DashboardService {
  getSummary(options?: RequestOptions): Promise<DashboardSummary>
}

export interface ApprovalService {
  getByToken(token: string, options?: RequestOptions): Promise<PublicApproval>
  respond(
    token: string,
    extraId: string,
    decision: ApprovalDecision,
  ): Promise<PublicApproval>
}
