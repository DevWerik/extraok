import { CalendarDays, Check, CheckCircle2, Clock3, ShieldCheck, X, XCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Brand } from '@/components/layout/brand'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useApproval, useRespondToExtra } from '@/features/extras/approval.queries'
import { extraStatusMeta } from '@/features/extras/extra-status'
import { useApprovalMotion } from '@/features/extras/use-approval-motion'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import { isServiceError } from '@/services/errors'
import type { ApprovalDecision, PublicApprovalExtra } from '@/services/contracts'

interface PendingDecision {
  extra: PublicApprovalExtra
  decision: ApprovalDecision
}

export function ApprovalPage() {
  const { token = '' } = useParams()
  const approval = useApproval(token)
  const respond = useRespondToExtra()
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null)
  const [feedback, setFeedback] = useState<{ decision: ApprovalDecision; title: string } | null>(null)
  const [feedbackSignal, setFeedbackSignal] = useState(0)
  const pageRef = useRef<HTMLElement>(null)
  useApprovalMotion(pageRef, feedbackSignal)

  async function confirmDecision() {
    if (!pendingDecision) return
    try {
      await respond.mutateAsync({
        token,
        extraId: pendingDecision.extra.id,
        decision: pendingDecision.decision,
      })
      setFeedback({ decision: pendingDecision.decision, title: pendingDecision.extra.title })
      setFeedbackSignal((value) => value + 1)
      setPendingDecision(null)
    } catch {
      // The dialog keeps the error close to the decision context.
    }
  }

  if (approval.isLoading) {
    return <ApprovalSkeleton />
  }

  if (approval.isError || !approval.data) {
    const message = isServiceError(approval.error)
      ? approval.error.message
      : 'Não foi possível abrir esta proposta.'
    return (
      <main className="grid min-h-screen place-items-center bg-background px-5 py-12">
        <div className="max-w-md text-center">
          <Brand className="mb-10" />
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive-soft text-destructive"><XCircle className="size-7" /></span>
          <h1 className="mt-5 text-2xl font-bold text-primary">Link indisponível</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message} Peça ao prestador um novo link de aprovação.</p>
        </div>
      </main>
    )
  }

  const data = approval.data
  const pendingCount = data.extras.filter((extra) => extra.status === 'pending').length

  return (
    <main ref={pageRef} className="min-h-screen bg-background pb-12">
      <header className="border-b bg-white">
        <div className="mx-auto flex min-h-18 w-full max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><ShieldCheck className="size-4 text-success" />Ambiente seguro de decisão</span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 py-7 sm:px-6 sm:py-10">
        <section className="rounded-2xl bg-primary p-5 text-white shadow-soft sm:p-7" aria-labelledby="approval-heading">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-300">Proposta de serviço extra</p>
          <h1 id="approval-heading" className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{data.businessName}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">{data.providerName} encontrou oportunidades para melhorar seu atendimento. Você decide o que faz sentido.</p>
          <div className="mt-5 grid gap-3 border-t border-white/15 pt-5 sm:grid-cols-2">
            <div className="flex gap-3"><CalendarDays className="mt-0.5 size-5 shrink-0 text-emerald-300" /><div><p className="text-xs text-slate-300">Atendimento</p><p className="mt-1 text-sm font-semibold">{data.serviceTitle}</p></div></div>
            <div className="flex gap-3"><Clock3 className="mt-0.5 size-5 shrink-0 text-emerald-300" /><div><p className="text-xs text-slate-300">Data combinada</p><p className="mt-1 text-sm font-semibold">{formatDateTime(data.scheduledAt)}</p></div></div>
          </div>
        </section>

        {feedback && (
          <div data-success-feedback className={`mt-5 flex items-start gap-3 rounded-xl border p-4 ${feedback.decision === 'approved' ? 'border-success/20 bg-success-soft text-success' : 'border-border bg-muted text-primary'}`} role="status">
            {feedback.decision === 'approved' ? <CheckCircle2 className="size-5 shrink-0" /> : <XCircle className="size-5 shrink-0" />}
            <div><p className="font-bold">Resposta registrada</p><p className="mt-0.5 text-sm">Você {feedback.decision === 'approved' ? 'aprovou' : 'recusou'} “{feedback.title}”.</p></div>
          </div>
        )}

        <div className="mt-7 flex items-end justify-between gap-4">
          <div><h2 className="text-xl font-bold text-primary">Serviços sugeridos</h2><p className="mt-1 text-sm text-muted-foreground">Avalie cada item separadamente.</p></div>
          {pendingCount > 0 && <Badge variant="warning">{pendingCount} pendente(s)</Badge>}
        </div>

        <div className="mt-4 space-y-4">
          {data.extras.map((extra) => {
            const meta = extraStatusMeta[extra.status]
            return (
              <article key={extra.id} className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-primary sm:text-lg">{extra.title}</h3>{extra.status !== 'pending' && <Badge variant="outline" className={meta.className}>{meta.label}</Badge>}</div><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{extra.description}</p></div>
                  <p className="shrink-0 text-xl font-extrabold text-primary">{formatCurrency(extra.priceCents)}</p>
                </div>
                {extra.status === 'pending' ? (
                  <div className="mt-5 grid grid-cols-2 gap-3 border-t pt-5">
                    <Button variant="outline" size="lg" className="border-destructive/25 text-destructive hover:bg-destructive-soft hover:text-destructive" onClick={() => setPendingDecision({ extra, decision: 'rejected' })}><X className="size-4" />Recusar</Button>
                    <Button size="lg" className="bg-success hover:bg-success/90" onClick={() => setPendingDecision({ extra, decision: 'approved' })}><Check className="size-4" />Aprovar</Button>
                  </div>
                ) : (
                  <p className="mt-5 border-t pt-4 text-sm font-medium text-muted-foreground">Sua decisão já foi registrada para este item.</p>
                )}
              </article>
            )
          })}
        </div>

        <section className="mt-6 rounded-2xl border bg-white p-5 sm:flex sm:items-center sm:justify-between sm:gap-5">
          <div><p className="text-sm font-semibold text-muted-foreground">Total aprovado até agora</p><p className="mt-1 text-2xl font-extrabold text-success">{formatCurrency(data.approvedTotalCents)}</p></div>
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground sm:mt-0 sm:text-right">A aprovação autoriza o prestador a incluir o serviço no atendimento. O pagamento será combinado diretamente com ele.</p>
        </section>

        <p className="mx-auto mt-8 max-w-xl text-center text-xs leading-relaxed text-muted-foreground">O ExtraOK mostra apenas as informações necessárias para esta decisão. Nenhum dado privado do cliente é exibido.</p>
      </div>

      <Dialog open={Boolean(pendingDecision)} onOpenChange={(open) => !open && setPendingDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingDecision?.decision === 'approved' ? 'Aprovar este serviço?' : 'Recusar este serviço?'}</DialogTitle>
            <DialogDescription>
              Confirme sua decisão sobre “{pendingDecision?.extra.title}”, no valor de {pendingDecision ? formatCurrency(pendingDecision.extra.priceCents) : ''}.
            </DialogDescription>
          </DialogHeader>
          {respond.isError && <p className="rounded-lg bg-destructive-soft p-3 text-sm text-destructive" role="alert">{isServiceError(respond.error) ? respond.error.message : 'Não foi possível registrar a resposta.'}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDecision(null)} disabled={respond.isPending}>Voltar</Button>
            <Button variant={pendingDecision?.decision === 'rejected' ? 'destructive' : 'default'} className={pendingDecision?.decision === 'approved' ? 'bg-success hover:bg-success/90' : undefined} onClick={confirmDecision} disabled={respond.isPending}>{respond.isPending ? 'Registrando...' : 'Confirmar decisão'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function ApprovalSkeleton() {
  return <main className="min-h-screen bg-background"><div className="border-b bg-white"><div className="mx-auto h-18 max-w-3xl" /></div><div className="mx-auto max-w-3xl space-y-5 px-4 py-8"><Skeleton className="h-60 rounded-2xl" />{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-52 rounded-2xl" />)}</div></main>
}
