import { CheckCircle2, Copy, QrCode, RefreshCw, Wallet } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useBilling, useBillingPayment, useCreatePayment } from '@/features/billing/billing.queries'
import type { BillingSummary, PaidPlanId, Plan } from '@/features/billing/billing.types'
import { paymentLabels, pixCountdown, visiblePaymentStatus } from '@/features/billing/billing.utils'
import { PlanCards } from '@/features/billing/plan-cards'
import { OwnerAccessPanel } from '@/features/billing/owner-access-panel'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import { queryKeys } from '@/lib/query-keys'
import { isServiceError } from '@/services/errors'

export function BillingPage() {
  const billing = useBilling()
  const purchase = useCreatePayment()
  const [selection, setSelection] = useState<{ plan: Plan; key: string } | null>(null)
  const [cpf, setCpf] = useState('')
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)
  const pendingPayment = billing.data?.payments.find((payment) => payment.status === 'pending' || payment.status === 'creating')
  const paymentId = selectedPaymentId ?? pendingPayment?.id ?? null

  function choosePlan(plan: Plan) {
    if (billing.data?.current.billingExempt) return
    purchase.reset()
    setCpf('')
    setSelection({ plan, key: crypto.randomUUID() })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selection || selection.plan.id === 'free' || purchase.isPending || billing.data?.current.billingExempt) return
    try {
      const payment = await purchase.mutateAsync({ planId: selection.plan.id as PaidPlanId, cpf, idempotencyKey: selection.key })
      setSelectedPaymentId(payment.id)
      setSelection(null)
      setCpf('')
    } catch { /* The form displays the API message and preserves the retry key. */ }
  }

  if (billing.isPending) return <div role="status" aria-label="Carregando seu plano" className="space-y-6"><Skeleton className="h-40 rounded-xl" /><div className="grid gap-5 md:grid-cols-3">{[1, 2, 3].map((id) => <Skeleton key={id} className="h-96 rounded-xl" />)}</div></div>
  if (!billing.data) return <section className="rounded-xl border bg-card p-8 text-center" role="alert"><h2 className="text-xl font-bold">Não foi possível consultar seu plano</h2><p className="mt-2 text-muted-foreground">Verifique sua conexão e tente novamente.</p><Button className="mt-4" onClick={() => void billing.refetch()}>Tentar novamente</Button></section>
  const data = billing.data
  if (data.current.billingExempt) return <OwnerAccessPanel summary={data} />
  const currentName = data.plans.find((plan) => plan.id === data.current.planId)?.name ?? 'Gratuito'
  const nextPurchaseDate = data.nextPurchaseStartsAt ? formatDateTime(data.nextPurchaseStartsAt) : null
  const scheduled = Boolean(nextPurchaseDate && (data.current.planId !== 'free' || data.upcoming.length > 0))

  return (
    <section aria-labelledby="billing-heading" className="space-y-8">
      <div><h2 id="billing-heading" className="text-2xl font-extrabold tracking-tight text-primary sm:text-3xl">Seu trabalho, no seu ritmo</h2><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Acompanhe seu limite e escolha o próximo plano. Os pagamentos são feitos somente por Pix, com renovação manual.</p></div>

      <Card className="border-success/25 bg-success-soft/30">
        <CardContent className="grid gap-6 md:grid-cols-[1fr_1fr]">
          <div><Badge variant="outline">Plano atual</Badge><h3 className="mt-3 flex items-center gap-2 text-2xl font-bold text-primary"><Wallet className="size-6" aria-hidden="true" />{currentName}</h3><p className="mt-2 text-sm text-muted-foreground">{data.current.planId === 'free' ? 'Limite mensal renova em' : 'Disponível até'} {formatDateTime(data.current.endsAt)}.</p></div>
          <div className="space-y-3"><p className="font-semibold text-primary">{data.current.used} de {data.current.limit} atendimentos com link</p><progress className="block h-3 w-full appearance-none overflow-hidden rounded-full border-0 bg-muted [&::-moz-progress-bar]:bg-success [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-success" value={data.current.used} max={data.current.limit} aria-label="Atendimentos utilizados no período" /><p className="text-sm text-muted-foreground">{data.current.remaining > 0 ? `${data.current.remaining} disponíveis neste período.` : 'Limite atingido. Os atendimentos já compartilhados continuam disponíveis.'}</p></div>
        </CardContent>
      </Card>

      {data.upcoming.length > 0 && <div className="rounded-xl border bg-card p-5"><h3 className="font-bold text-primary">Próximos períodos já pagos</h3><ul className="mt-3 space-y-2 text-sm text-muted-foreground">{data.upcoming.map((period) => <li key={period.id}><strong className="text-primary">{data.plans.find((plan) => plan.id === period.plan)?.name}</strong> · {period.jobLimit} atendimentos · {formatDateTime(period.startsAt)} até {formatDateTime(period.endsAt)}</li>)}</ul></div>}

      {data.current.planId !== 'free' && <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Para encerrar o plano, basta não renovar. Você mantém o período pago e depois retorna ao Gratuito. Uma nova compra, inclusive de outro plano, começa após os períodos já pagos; ela não aumenta o limite atual.</p>}

      {paymentId && <PixPaymentPanel key={paymentId} id={paymentId} summary={data} onClose={() => setSelectedPaymentId(null)} />}

      <div className="space-y-5">
        <div><h3 className="text-xl font-bold text-primary">Escolha seu plano</h3><p className="mt-1 text-sm text-muted-foreground">{scheduled ? `Seu próximo período começa em ${nextPurchaseDate}.` : 'Os 30 dias começam quando o pagamento for confirmado.'}</p></div>
        {!data.pixAvailable && <p className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm" role="status">O pagamento por Pix está temporariamente indisponível. Você pode continuar usando seu plano atual.</p>}
        {pendingPayment && <p className="text-sm text-muted-foreground" role="status">Você já tem um Pix em aberto. Conclua esse pagamento ou aguarde a validade antes de comprar outro plano.</p>}
        <PlanCards plans={data.plans} action={(plan) => plan.id === 'free'
          ? <Button className="w-full" variant="outline" disabled>{data.current.planId === 'free' ? 'Seu plano atual' : 'Disponível após o período pago'}</Button>
          : <Button className="w-full" variant={plan.id === 'pro' ? 'default' : 'outline'} disabled={!data.pixAvailable || Boolean(pendingPayment)} onClick={() => choosePlan(plan)}><QrCode className="size-4" aria-hidden="true" />{scheduled ? `Renovar com ${plan.name}` : `Ativar ${plan.name}`}</Button>} />
        <p className="text-sm leading-relaxed text-muted-foreground">O limite é consumido apenas no primeiro link de cada atendimento. Reenvios, substituições do link e extras do mesmo atendimento não consomem outra unidade. O saldo não acumula entre períodos. No Gratuito, o mês segue o horário de Brasília.</p>
      </div>

      <div className="space-y-3"><h3 className="text-xl font-bold text-primary">Últimas cobranças</h3>{data.payments.length === 0 ? <p className="text-sm text-muted-foreground">Você ainda não gerou cobranças de plano.</p> : <ul className="divide-y rounded-xl border bg-card">{data.payments.map((payment) => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold text-primary">{data.plans.find((plan) => plan.id === payment.planId)?.name} · {formatCurrency(payment.priceCents)}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(payment.createdAt)} · {paymentLabels[payment.status]}</p></div><Button size="sm" variant="outline" onClick={() => setSelectedPaymentId(payment.id)}>Ver cobrança</Button></li>)}</ul>}</div>

      <Dialog open={Boolean(selection)} onOpenChange={(open) => { if (!open && !purchase.isPending) { setSelection(null); setCpf(''); purchase.reset() } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pagar {selection?.plan.name} com Pix</DialogTitle><DialogDescription>{selection && formatCurrency(selection.plan.priceCents)} por 30 dias, com até {selection?.plan.jobLimit} atendimentos com link. Sem renovação automática.</DialogDescription></DialogHeader>
          <p className="rounded-lg bg-muted p-3 text-sm">{scheduled ? `O período será adicionado após os já pagos, a partir de ${nextPurchaseDate}. O novo limite e os benefícios começam nessa data.` : 'Seu plano será liberado depois da confirmação do pagamento.'}</p>
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="billing-cpf">CPF do pagador</Label><Input id="billing-cpf" name="cpf" inputMode="numeric" autoComplete="off" maxLength={14} value={cpf} onChange={(event) => setCpf(event.target.value.replace(/[^\d.-]/g, '').slice(0, 14))} required disabled={purchase.isPending} aria-describedby="billing-cpf-help billing-form-error" /><p id="billing-cpf-help" className="text-xs text-muted-foreground">Usado para gerar sua cobrança no Mercado Pago.</p></div>
            <div id="billing-form-error" role="alert">{purchase.isError && <p className="text-sm text-destructive">{isServiceError(purchase.error) ? purchase.error.message : 'Não foi possível gerar o Pix. Tente novamente.'}</p>}</div>
            <Button type="submit" className="w-full" disabled={purchase.isPending || cpf.replace(/\D/g, '').length !== 11}><QrCode className="size-4" aria-hidden="true" />{purchase.isPending ? 'Gerando Pix...' : `Gerar Pix de ${selection ? formatCurrency(selection.plan.priceCents) : ''}`}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function PixPaymentPanel({ id, summary, onClose }: { id: string; summary: BillingSummary; onClose: () => void }) {
  const query = useBillingPayment(id)
  const client = useQueryClient()
  const { copy, copied } = useCopyToClipboard()
  const [now, setNow] = useState(() => Date.now())
  const payment = query.data ?? summary.payments.find((entry) => entry.id === id)
  const status = payment ? visiblePaymentStatus(payment.status, payment.expiresAt, now) : undefined

  useEffect(() => {
    if (status !== 'creating' && status !== 'pending') return
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [status])
  useEffect(() => {
    if (!status || status === 'creating' || status === 'pending') return
    void client.invalidateQueries({ queryKey: queryKeys.billing.summary })
  }, [status, client])

  async function copyPix() {
    if (!payment?.qrCode) return
    try { await copy(payment.qrCode); toast.success('Código Pix copiado.') }
    catch { toast.error('Não foi possível copiar. Selecione o código abaixo.') }
  }

  return <Card className="border-success/30" aria-label="Cobrança Pix">
    <CardHeader><h3 className="text-xl font-bold text-primary">{status ? paymentLabels[status] : 'Consultando cobrança...'}</h3>{payment && <p className="text-sm text-muted-foreground">{summary.plans.find((plan) => plan.id === payment.planId)?.name} · {formatCurrency(payment.priceCents)}</p>}</CardHeader>
    <CardContent className="space-y-4">
      <div role="status" aria-live="polite">{status === 'approved' ? <p className="flex items-start gap-2 font-semibold text-success"><CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />Pagamento confirmado. Consulte acima a validade do período liberado.</p> : status === 'creating' ? <p>Estamos preparando sua cobrança. Ela aparecerá aqui automaticamente.</p> : status === 'pending' ? <p className="text-sm">Escaneie o QR Code no aplicativo do seu banco ou use o Pix Copia e Cola. A confirmação aparecerá automaticamente.</p> : status === 'expired' ? <p className="text-sm">A validade deste Pix terminou. Se você já pagou, atualize a cobrança antes de gerar outro Pix.</p> : status === 'refunded' ? <p className="text-sm">O período desta cobrança foi desativado após o reembolso. Seu histórico de atendimentos foi preservado.</p> : status ? <p className="text-sm">Esta cobrança não liberou um plano. Você pode escolher uma nova opção acima.</p> : null}</div>
      {payment && status === 'pending' && payment.qrCode && <div className="grid items-center gap-5 sm:grid-cols-[12rem_1fr]">
        {payment.qrCodeBase64 && <img src={`data:image/png;base64,${payment.qrCodeBase64}`} alt={`QR Code para pagar ${formatCurrency(payment.priceCents)} via Pix`} width={192} height={192} className="mx-auto rounded-lg border bg-white p-2" />}
        <div className="min-w-0 space-y-3"><p className="text-sm font-semibold">Validade: <span className="tabular-nums">{pixCountdown(payment.expiresAt, now)}</span></p><Label htmlFor={`pix-code-${id}`}>Pix Copia e Cola</Label><textarea id={`pix-code-${id}`} readOnly value={payment.qrCode} className="min-h-24 w-full resize-none rounded-lg border bg-muted p-3 text-xs break-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onFocus={(event) => event.target.select()} /><Button onClick={() => void copyPix()} className="w-full sm:w-auto"><Copy className="size-4" aria-hidden="true" />{copied ? 'Pix copiado' : 'Copiar código Pix'}</Button></div>
      </div>}
      {query.isError && <p className="text-sm text-destructive" role="alert">Não foi possível atualizar a cobrança. Se já pagou, aguarde a confirmação antes de tentar outro pagamento.</p>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className="size-4" aria-hidden="true" />{query.isFetching ? 'Consultando...' : 'Atualizar pagamento'}</Button>{status === 'approved' && <Button asChild><Link to="/atendimentos">Ir aos atendimentos</Link></Button>}{status && !['creating', 'pending'].includes(status) && <Button variant="ghost" onClick={onClose}>Fechar cobrança</Button>}</div>
    </CardContent>
  </Card>
}
