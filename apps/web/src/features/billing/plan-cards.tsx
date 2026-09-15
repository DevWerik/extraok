import { Check, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Plan, PlanId } from './billing.types'

const descriptions: Record<PlanId, string> = {
  free: 'Experimente o fluxo completo com seus primeiros clientes.',
  pro: 'Para organizar os extras e aprovações da sua rotina.',
  business: 'Mais capacidade para quem tem um volume maior de atendimentos.',
}

export function PlanCards({ plans, action }: { plans: Plan[]; action: (plan: Plan) => ReactNode }) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {plans.map((plan) => (
        <Card key={plan.id} className={cn('relative h-full gap-5', plan.id === 'pro' && 'border-2 border-success shadow-md')}>
          <CardHeader>
            <div className="mb-2 flex min-h-6 flex-wrap items-center justify-between gap-2">
              <h3 className="text-xl font-bold text-primary">{plan.name}</h3>
              {plan.id === 'pro' && <Badge className="border-success/20 bg-success-soft text-success"><Sparkles className="size-3" aria-hidden="true" />Recomendado</Badge>}
            </div>
            <p className="min-h-15 text-sm leading-relaxed text-muted-foreground">{descriptions[plan.id]}</p>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-primary">{formatCurrency(plan.priceCents)}</p>
            <p className="text-xs text-muted-foreground">{plan.durationDays ? `por ${plan.durationDays} dias · pagamento via Pix` : 'sem pagamento · limite mensal'}</p>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-3 text-sm">
              {[
                `${plan.jobLimit} atendimentos com link ${plan.id === 'free' ? 'por mês' : 'por período'}`,
                'Cadastro de clientes e serviços extras',
                'Aprovação pelo celular do cliente',
                'Histórico de atendimentos e respostas',
                'Reenvio do mesmo atendimento sem novo consumo',
              ].map((benefit) => <li key={benefit} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /><span>{benefit}</span></li>)}
            </ul>
          </CardContent>
          <CardFooter>{action(plan)}</CardFooter>
        </Card>
      ))}
    </div>
  )
}
