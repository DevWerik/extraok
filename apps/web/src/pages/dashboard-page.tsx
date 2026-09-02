import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  Clock3,
  Plus,
  TrendingUp,
} from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/features/auth/auth.queries'
import { RevenueChart } from '@/features/dashboard/components/revenue-chart'
import { useDashboardSummary } from '@/features/dashboard/dashboard.queries'
import { useDashboardMotion } from '@/features/dashboard/use-dashboard-motion'
import { jobStatusMeta } from '@/features/jobs/job-status'
import { formatCurrency, formatDateTime, formatLongDate, formatPercentage } from '@/lib/formatters'

export function DashboardPage() {
  const sectionRef = useRef<HTMLElement>(null)
  const session = useSession()
  const summary = useDashboardSummary()
  useDashboardMotion(sectionRef)

  if (summary.isLoading) {
    return <DashboardSkeleton />
  }

  if (summary.isError || !summary.data) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive-soft p-6 text-destructive" role="alert">
        <h2 className="font-bold">Não foi possível carregar o resumo</h2>
        <p className="mt-1 text-sm">Tente novamente em alguns instantes.</p>
        <Button variant="outline" className="mt-4" onClick={() => summary.refetch()}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  const data = summary.data
  const firstName = session.data?.user.name.trim().split(/\s+/)[0] ?? ''
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const metrics = [
    {
      label: 'Receita adicional',
      value: formatCurrency(data.additionalRevenueCents),
      helper: 'gerada com extras aprovados',
      icon: CircleDollarSign,
      tone: 'bg-success-soft text-success',
    },
    {
      label: 'Extras aprovados',
      value: String(data.approvedExtrasCount),
      helper: 'oportunidades convertidas',
      icon: BadgeCheck,
      tone: 'bg-info-soft text-info',
    },
    {
      label: 'Extras pendentes',
      value: String(data.pendingExtrasCount),
      helper: 'aguardando uma resposta',
      icon: Clock3,
      tone: 'bg-warning-soft text-warning',
    },
    {
      label: 'Taxa de aprovação',
      value: formatPercentage(data.approvalRate),
      helper: 'entre extras respondidos',
      icon: TrendingUp,
      tone: 'bg-accent text-success',
    },
  ]

  return (
    <section ref={sectionRef} aria-labelledby="dashboard-heading" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-success">{formatLongDate(new Date())}</p>
          <h2 id="dashboard-heading" className="mt-1 text-2xl font-extrabold tracking-tight text-primary sm:text-3xl">
            {greeting}{firstName ? `, ${firstName}` : ''}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Veja como os serviços extras estão contribuindo para o seu negócio.</p>
        </div>
        <Button asChild size="lg">
          <Link to="/atendimentos/novo">
            <Plus className="size-4" />
            Novo atendimento
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, helper, icon: Icon, tone }) => (
          <Card key={label} data-metric-card className="gap-4 py-5">
            <CardContent className="px-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-extrabold tracking-tight text-primary">{value}</p>
                </div>
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{helper}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Evolução da receita adicional</CardTitle>
            <CardDescription>Valores aprovados nos últimos meses</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueChart data={data.revenueEvolution} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Aguardando resposta</CardTitle>
              <CardDescription>Extras que ainda precisam da decisão do cliente</CardDescription>
            </div>
            <Badge variant="warning">{data.awaitingResponse.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-1 px-3 sm:px-6">
            {data.awaitingResponse.map((extra) => (
              <Link
                key={extra.id}
                to={`/atendimentos/${extra.jobId}`}
                className="flex items-center justify-between gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-primary">{extra.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{extra.clientName}</span>
                </span>
                <span className="shrink-0 text-sm font-bold text-primary">{formatCurrency(extra.priceCents)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Atendimentos recentes</CardTitle>
            <CardDescription>Acompanhe as últimas movimentações</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/atendimentos">
              Ver todos <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="divide-y px-3 sm:px-6">
          {data.recentJobs.map((job) => {
            const status = jobStatusMeta[job.status]
            return (
              <Link
                key={job.id}
                to={`/atendimentos/${job.id}`}
                className="grid gap-2 rounded-lg px-3 py-4 transition-colors hover:bg-muted sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-primary">{job.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{job.clientName}</span>
                </span>
                <span className="text-xs text-muted-foreground sm:text-sm">{formatDateTime(job.scheduledAt)}</span>
                <Badge variant="outline" className={status.className}>{status.label}</Badge>
              </Link>
            )
          })}
        </CardContent>
      </Card>
    </section>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-label="Carregando dashboard">
      <Skeleton className="h-20 w-full max-w-lg" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  )
}
