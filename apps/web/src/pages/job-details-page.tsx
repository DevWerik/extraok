import {
  ArrowLeft,
  Calendar,
  Check,
  Clipboard,
  Copy,
  Link2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ResponsiveFormSurface } from '@/components/common/responsive-form-surface'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ExtraForm } from '@/features/extras/components/extra-form'
import type { ExtraFormValues } from '@/features/extras/extra.schema'
import {
  useCreateExtra,
  useDeleteExtra,
  useUpdateExtra,
} from '@/features/extras/extra.queries'
import { extraStatusMeta } from '@/features/extras/extra-status'
import {
  useCreateApprovalLink,
  useJob,
  useUpdateJobStatus,
} from '@/features/jobs/job.queries'
import { jobStatusMeta } from '@/features/jobs/job-status'
import { centsToCurrencyInput, parseCurrencyInputToCents } from '@/lib/currency'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { isServiceError } from '@/services/errors'
import { useBilling } from '@/features/billing/billing.queries'
import type { Extra, JobStatus } from '@/types/domain'

const allowedStatusTransitions: Record<JobStatus, readonly JobStatus[]> = {
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function JobDetailsPage() {
  const { id = '' } = useParams()
  const details = useJob(id)
  const billing = useBilling()
  const updateStatus = useUpdateJobStatus()
  const createApprovalLink = useCreateApprovalLink()
  const createExtra = useCreateExtra()
  const updateExtra = useUpdateExtra()
  const deleteExtra = useDeleteExtra()
  const [surfaceOpen, setSurfaceOpen] = useState(false)
  const [editingExtra, setEditingExtra] = useState<Extra | null>(null)
  const [deletingExtra, setDeletingExtra] = useState<Extra | null>(null)
  const [generatedApproval, setGeneratedApproval] = useState<{
    jobId: string
    url: string
  } | null>(null)
  const approvalUrl = generatedApproval?.jobId === id ? generatedApproval.url : null
  const { copy, copied } = useCopyToClipboard()
  const formId = 'extra-form'
  const isSaving = createExtra.isPending || updateExtra.isPending

  if (details.isLoading) {
    return <JobDetailsSkeleton />
  }

  if (details.isError || !details.data) {
    return (
      <section className="mx-auto max-w-xl rounded-2xl border bg-card p-8 text-center">
        <h2 className="text-xl font-bold text-primary">Atendimento não encontrado</h2>
        <p className="mt-2 text-sm text-muted-foreground">O registro pode ter sido removido ou o endereço está incorreto.</p>
        <Button asChild className="mt-6"><Link to="/atendimentos"><ArrowLeft className="size-4" />Voltar</Link></Button>
      </section>
    )
  }

  const { job, client, extras, approvedTotalCents, approvalLink } = details.data
  const statusMeta = jobStatusMeta[job.status]
  const limitReached = !approvalLink.alreadyShared && billing.data?.current.remaining === 0

  function openCreate() {
    setEditingExtra(null)
    setSurfaceOpen(true)
  }

  function openEdit(extra: Extra) {
    setEditingExtra(extra)
    setSurfaceOpen(true)
  }

  async function handleSave(values: ExtraFormValues) {
    const priceCents = parseCurrencyInputToCents(values.price)
    if (!priceCents) return
    try {
      const input = { title: values.title, description: values.description, priceCents }
      if (editingExtra) {
        await updateExtra.mutateAsync({ id: editingExtra.id, jobId: job.id, input })
        toast.success('Serviço extra atualizado.')
      } else {
        await createExtra.mutateAsync({ jobId: job.id, ...input })
        toast.success('Serviço extra adicionado e pronto para aprovação.')
      }
      setSurfaceOpen(false)
    } catch (error) {
      toast.error(isServiceError(error) ? error.message : 'Não foi possível salvar o extra.')
    }
  }

  async function handleDelete() {
    if (!deletingExtra) return
    try {
      await deleteExtra.mutateAsync({ id: deletingExtra.id, jobId: job.id })
      toast.success('Serviço extra removido.')
      setDeletingExtra(null)
    } catch (error) {
      toast.error(isServiceError(error) ? error.message : 'Não foi possível remover o extra.')
    }
  }

  async function handleCopy() {
    if (!approvalUrl) return
    try {
      await copy(approvalUrl)
      toast.success('Link de aprovação copiado.')
    } catch {
      toast.error('Não foi possível copiar. Selecione o endereço manualmente.')
    }
  }

  async function handleCreateApprovalLink() {
    try {
      const link = await createApprovalLink.mutateAsync(job.id)
      setGeneratedApproval({
        jobId: job.id,
        url: `${window.location.origin}/aprovar/${link.token}`,
      })
      toast.success(
        approvalLink.active
          ? 'Novo link gerado. O endereço anterior foi revogado.'
          : 'Link de aprovação gerado com segurança.',
      )
    } catch (error) {
      if (isServiceError(error) && error.code === 'PLAN_LIMIT_REACHED') {
        void billing.refetch()
      }
      toast.error(isServiceError(error) ? error.message : 'Não foi possível gerar o link.')
    }
  }

  async function handleStatusChange(value: string) {
    try {
      await updateStatus.mutateAsync({ id: job.id, status: value as JobStatus })
      toast.success('Status do atendimento atualizado.')
    } catch (error) {
      toast.error(isServiceError(error) ? error.message : 'Não foi possível atualizar o status.')
    }
  }

  return (
    <section aria-labelledby="job-detail-heading" className="space-y-6">
      <Button asChild variant="ghost" className="-ml-3"><Link to="/atendimentos"><ArrowLeft className="size-4" />Voltar aos atendimentos</Link></Button>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={statusMeta.className}>{statusMeta.label}</Badge>
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">#{job.id.replace('job_', '')}</span>
          </div>
          <h2 id="job-detail-heading" className="mt-3 text-2xl font-extrabold tracking-tight text-primary sm:text-3xl">{job.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{job.description}</p>
        </div>
        <div className="w-full lg:w-52">
          <label className="mb-2 block text-xs font-semibold text-muted-foreground" htmlFor="job-status">Status do atendimento</label>
          <Select value={job.status} onValueChange={handleStatusChange} disabled={updateStatus.isPending || allowedStatusTransitions[job.status].length === 0}>
            <SelectTrigger id="job-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled" disabled={job.status !== 'scheduled'}>Agendado</SelectItem>
              <SelectItem value="in_progress" disabled={job.status !== 'in_progress' && !allowedStatusTransitions[job.status].includes('in_progress')}>Em andamento</SelectItem>
              <SelectItem value="completed" disabled={job.status !== 'completed' && !allowedStatusTransitions[job.status].includes('completed')}>Finalizado</SelectItem>
              <SelectItem value="cancelled" disabled={job.status !== 'cancelled' && !allowedStatusTransitions[job.status].includes('cancelled')}>Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <Card className="gap-4 py-5">
          <CardHeader><CardTitle>Resumo do atendimento</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><Calendar className="size-4" /></span><div><p className="text-xs font-semibold text-muted-foreground">Data e horário</p><p className="mt-1 text-sm font-semibold text-primary">{formatDateTime(job.scheduledAt)}</p></div></div>
            <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><UserRound className="size-4" /></span><div><p className="text-xs font-semibold text-muted-foreground">Cliente</p><p className="mt-1 text-sm font-semibold text-primary">{client.name}</p></div></div>
            <a href={`tel:${client.phone}`} className="flex gap-3 rounded-lg hover:bg-muted"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><Phone className="size-4" /></span><div><p className="text-xs font-semibold text-muted-foreground">Telefone</p><p className="mt-1 text-sm font-semibold text-primary">{client.phone}</p></div></a>
            <a href={`mailto:${client.email}`} className="flex min-w-0 gap-3 rounded-lg hover:bg-muted"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><Mail className="size-4" /></span><div className="min-w-0"><p className="text-xs font-semibold text-muted-foreground">E-mail</p><p className="mt-1 truncate text-sm font-semibold text-primary">{client.email}</p></div></a>
          </CardContent>
        </Card>

        <Card className="gap-4 border-success/20 bg-success-soft/40 py-5">
          <CardHeader><CardTitle className="text-success">Total aprovado</CardTitle><CardDescription>Soma dos extras aceitos pelo cliente</CardDescription></CardHeader>
          <CardContent><p className="text-3xl font-extrabold tracking-tight text-primary">{formatCurrency(approvedTotalCents)}</p><p className="mt-2 text-xs text-muted-foreground">{extras.filter((extra) => extra.status === 'approved').length} serviço(s) extra(s) aprovado(s)</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div><CardTitle>Link de aprovação</CardTitle><CardDescription>Envie este endereço ao cliente para ele decidir sobre os extras.</CardDescription></div>
          <Clipboard className="size-5 text-success" />
        </CardHeader>
        <CardContent>
          {approvalUrl ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <code className="min-w-0 flex-1 truncate rounded-lg border bg-muted px-3 py-2.5 text-sm text-primary">{approvalUrl}</code>
                <Button variant={copied ? 'secondary' : 'default'} onClick={handleCopy}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? 'Copiado' : 'Copiar link'}</Button>
              </div>
              <p className="text-xs text-muted-foreground">Guarde este endereço agora: por segurança, o token não será exibido novamente depois que você sair da página.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-primary">
                  {approvalLink.active ? 'Já existe um link ativo para este atendimento.' : 'Nenhum link ativo foi gerado.'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {approvalLink.active && approvalLink.expiresAt
                    ? `O link atual expira em ${formatDateTime(approvalLink.expiresAt)}. Gerar outro revoga o anterior.`
                    : 'Gere um endereço temporário para enviar ao cliente.'}
                </p>
              </div>
              <Button
                onClick={handleCreateApprovalLink}
                disabled={createApprovalLink.isPending || extras.length === 0 || limitReached}
              >
                <Link2 className="size-4" />
                {createApprovalLink.isPending
                  ? 'Gerando...'
                  : approvalLink.active
                    ? 'Substituir link'
                    : 'Gerar link'}
              </Button>
            </div>
          )}
          {extras.length === 0 && <p className="mt-3 text-xs text-warning">Adicione pelo menos um serviço extra antes de gerar o link.</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
            <p className={limitReached ? 'font-semibold text-destructive' : 'text-muted-foreground'}>
              {approvalLink.alreadyShared ? 'Este atendimento já foi contabilizado. Substituir o link não consome seu limite.' : limitReached ? 'Você atingiu o limite de atendimentos com link deste período.' : billing.data ? `${billing.data.current.remaining} atendimentos com link disponíveis no seu plano.` : 'Seu limite será verificado ao gerar o primeiro link.'}
            </p>
            <Button asChild size="sm" variant="outline"><Link to="/meu-plano">Meu plano</Link></Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h3 className="text-xl font-bold text-primary">Serviços extras</h3><p className="mt-1 text-sm text-muted-foreground">Edite ou remova apenas itens que ainda estão pendentes.</p></div>
        <Button onClick={openCreate}><Plus className="size-4" />Adicionar extra</Button>
      </div>

      {extras.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center"><MapPin className="mx-auto size-7 text-muted-foreground" /><h4 className="mt-3 font-bold text-primary">Nenhum extra cadastrado</h4><p className="mt-1 text-sm text-muted-foreground">Adicione uma oportunidade relevante para este atendimento.</p><Button className="mt-5" onClick={openCreate}><Plus className="size-4" />Adicionar primeiro extra</Button></div>
      ) : (
        <div className="space-y-3">
          {extras.map((extra) => {
            const meta = extraStatusMeta[extra.status]
            return (
              <article key={extra.id} className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="font-bold text-primary">{extra.title}</h4><Badge variant="outline" className={meta.className}>{meta.label}</Badge></div><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{extra.description}</p></div>
                  <div className="flex shrink-0 items-center justify-between gap-2 sm:flex-col sm:items-end"><p className="text-lg font-extrabold text-primary">{formatCurrency(extra.priceCents)}</p>{extra.status === 'pending' && <div className="flex"><Button variant="ghost" size="icon-sm" onClick={() => openEdit(extra)} aria-label={`Editar ${extra.title}`}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeletingExtra(extra)} aria-label={`Remover ${extra.title}`}><Trash2 className="size-4" /></Button></div>}</div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <ResponsiveFormSurface
        open={surfaceOpen}
        onOpenChange={setSurfaceOpen}
        title={editingExtra ? 'Editar serviço extra' : 'Adicionar serviço extra'}
        description="Apresente uma oportunidade clara, útil e com valor transparente."
        contentClassName="md:max-w-xl max-h-[92svh]"
        footer={<><Button variant="outline" onClick={() => setSurfaceOpen(false)} disabled={isSaving}>Cancelar</Button><Button type="submit" form={formId} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar extra'}</Button></>}
      >
        <ExtraForm formId={formId} disabled={isSaving} initialValues={editingExtra ? { title: editingExtra.title, description: editingExtra.description, price: centsToCurrencyInput(editingExtra.priceCents) } : undefined} onSubmit={handleSave} />
      </ResponsiveFormSurface>

      <Dialog open={Boolean(deletingExtra)} onOpenChange={(open) => !open && setDeletingExtra(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remover serviço extra?</DialogTitle><DialogDescription>“{deletingExtra?.title}” será removido desta proposta. Esta ação não afeta o atendimento principal.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeletingExtra(null)}>Cancelar</Button><Button variant="destructive" onClick={handleDelete} disabled={deleteExtra.isPending}><Trash2 className="size-4" />{deleteExtra.isPending ? 'Removendo...' : 'Remover extra'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function JobDetailsSkeleton() {
  return <div className="space-y-5" aria-label="Carregando atendimento"><Skeleton className="h-28 rounded-xl" /><div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-48 rounded-xl" /><Skeleton className="h-48 rounded-xl" /></div><Skeleton className="h-36 rounded-xl" />{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div>
}
