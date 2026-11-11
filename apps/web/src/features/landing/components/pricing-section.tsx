import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PlanCards } from '@/features/billing/plan-cards'
import { publicPlans } from '@/features/billing/public-plans'
import { SectionHeading } from './section-heading'

export function PricingSection() {
  return (
    <section id="planos" className="scroll-mt-28 border-t bg-muted/30 px-4 py-16 sm:px-6 sm:py-20 lg:px-8" aria-label="Planos ExtraOK">
      <div className="mx-auto max-w-7xl space-y-8">
        <SectionHeading eyebrow="Planos" title="Um plano para cada fase do seu trabalho" description="Comece gratuitamente. Quando precisar de mais atendimentos, escolha um plano de 30 dias e pague somente com Pix." />
        <PlanCards plans={publicPlans} action={(plan) => <Button asChild className="w-full" variant={plan.id === 'pro' ? 'default' : 'outline'}><Link to={plan.id === 'free' ? '/cadastro' : '/meu-plano'}>{plan.id === 'free' ? 'Começar grátis' : `Conhecer o ${plan.name}`}</Link></Button>} />
        <p className="text-center text-sm text-muted-foreground">Um atendimento conta apenas ao gerar seu primeiro link. Renovação manual, sem débito automático. Seu histórico continua disponível ao encerrar o plano.</p>
      </div>
    </section>
  )
}
