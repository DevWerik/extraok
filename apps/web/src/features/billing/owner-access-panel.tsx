import { Check, Crown, FileBarChart, Link2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import type { BillingSummary } from './billing.types'
import { paymentLabels } from './billing.utils'

export function OwnerAccessPanel({ summary }: { summary: BillingSummary }) {
  const benefits = summary.plans.find((plan) => plan.id === 'business')?.benefits.slice(1) ?? []
  return <section aria-labelledby="owner-access-heading" className="space-y-6">
    <div><h2 id="owner-access-heading" className="text-2xl font-extrabold tracking-tight text-primary sm:text-3xl">Acesso do proprietário</h2><p className="mt-2 text-sm text-muted-foreground">Todos os recursos dos planos liberados para sua conta, sem pagamento ou renovação.</p></div>
    <Card className="border-success/25 bg-success-soft/30">
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div><Badge variant="outline">Isenção de cobrança</Badge><h3 className="mt-3 flex items-center gap-2 text-2xl font-bold text-primary"><Crown className="size-6 shrink-0" aria-hidden="true" />Proprietário</h3><p className="mt-2 font-semibold text-success">Acesso completo, sem cobrança</p><p className="mt-2 text-sm text-muted-foreground">Sem vencimento de assinatura.</p></div>
        <div className="space-y-3"><p className="text-xl font-bold text-primary">Atendimentos com link sem limite mensal</p><p className="text-sm text-muted-foreground">{summary.current.used} atendimento(s) compartilhado(s) no histórico da conta.</p><p className="text-sm text-muted-foreground">Cada link mantém sua validade. Você pode gerar outro para o mesmo atendimento quando precisar.</p></div>
      </CardContent>
    </Card>
    <Card><CardContent className="space-y-5"><h3 className="text-lg font-bold text-primary">Recursos liberados</h3><ul className="grid gap-3 text-sm sm:grid-cols-2">{benefits.map((benefit) => <li key={benefit} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /><span>{benefit}</span></li>)}</ul><div className="flex flex-wrap gap-3"><Button asChild><Link to="/atendimentos"><Link2 className="size-4" aria-hidden="true" />Ver atendimentos</Link></Button><Button asChild variant="outline"><Link to="/relatorios"><FileBarChart className="size-4" aria-hidden="true" />Ver relatórios</Link></Button></div></CardContent></Card>
    {summary.upcoming.length > 0 && <div className="space-y-3 rounded-xl border bg-card p-5"><h3 className="font-bold text-primary">Períodos já adquiridos</h3><p className="text-sm text-muted-foreground">As datas das compras anteriores são preservadas. Sua isenção libera os recursos durante e depois desses períodos.</p><ul className="space-y-2 text-sm">{summary.upcoming.map((period) => <li key={period.id}>{summary.plans.find((plan) => plan.id === period.plan)?.name} · {formatDateTime(period.startsAt)} até {formatDateTime(period.endsAt)}</li>)}</ul></div>}
    {summary.payments.length > 0 && <div className="space-y-3"><h3 className="text-lg font-bold text-primary">Histórico de cobranças</h3><p className="text-sm text-muted-foreground">Você não precisa pagar cobranças pendentes para usar os recursos da sua conta.</p><ul className="divide-y rounded-xl border bg-card">{summary.payments.map((payment) => <li key={payment.id} className="p-4"><p className="font-semibold text-primary">{summary.plans.find((plan) => plan.id === payment.planId)?.name} · {formatCurrency(payment.priceCents)}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(payment.createdAt)} · {paymentLabels[payment.status]}</p></li>)}</ul></div>}
  </section>
}
