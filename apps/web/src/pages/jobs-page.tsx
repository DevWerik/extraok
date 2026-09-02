import { CalendarClock, Plus, Search, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/common/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { jobStatusMeta } from '@/features/jobs/job-status'
import { useJobs } from '@/features/jobs/job.queries'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import type { JobStatus } from '@/types/domain'

type StatusFilter = JobStatus | 'all'

export function JobsPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const jobs = useJobs({ search, status })

  return (
    <section aria-labelledby="jobs-heading" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="jobs-heading" className="text-2xl font-extrabold tracking-tight text-primary sm:text-3xl">Atendimentos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Acompanhe os serviços e as oportunidades de extras.</p>
        </div>
        <Button asChild size="lg"><Link to="/atendimentos/novo"><Plus className="size-4" />Novo atendimento</Link></Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Buscar atendimento ou cliente" aria-label="Buscar atendimentos" />
        </div>
        <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
          <SelectTrigger aria-label="Filtrar por status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="scheduled">Agendados</SelectItem>
            <SelectItem value="in_progress">Em andamento</SelectItem>
            <SelectItem value="completed">Finalizados</SelectItem>
            <SelectItem value="cancelled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {jobs.isLoading ? (
        <JobsSkeleton />
      ) : jobs.isError ? (
        <EmptyState icon={<Wrench />} title="Não foi possível carregar os atendimentos" description="Tente novamente em alguns instantes." action={<Button variant="outline" onClick={() => jobs.refetch()}>Tentar novamente</Button>} />
      ) : !jobs.data?.length ? (
        <EmptyState icon={<CalendarClock />} title="Nenhum atendimento encontrado" description={search || status !== 'all' ? 'Altere os filtros para ampliar a busca.' : 'Crie o primeiro atendimento para começar a oferecer extras.'} action={!search && status === 'all' ? <Button asChild><Link to="/atendimentos/novo"><Plus className="size-4" />Novo atendimento</Link></Button> : undefined} />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {jobs.data.map((job) => {
              const meta = jobStatusMeta[job.status]
              return (
                <Link key={job.id} to={`/atendimentos/${job.id}`} className="rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="line-clamp-2 font-bold text-primary">{job.title}</h3><p className="mt-1 text-sm text-muted-foreground">{job.clientName}</p></div>
                    <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
                    <span className="text-muted-foreground">{formatDateTime(job.scheduledAt)}</span>
                    <span className="font-bold text-success">{formatCurrency(job.approvedTotalCents)}</span>
                  </div>
                  {job.pendingExtrasCount > 0 && <p className="mt-2 text-xs font-semibold text-warning">{job.pendingExtrasCount} extra(s) aguardando resposta</p>}
                </Link>
              )
            })}
          </div>

          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
            <Table>
              <TableHeader><TableRow><TableHead>Atendimento</TableHead><TableHead>Cliente</TableHead><TableHead>Data</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total aprovado</TableHead></TableRow></TableHeader>
              <TableBody>
                {jobs.data.map((job) => {
                  const meta = jobStatusMeta[job.status]
                  return (
                    <TableRow key={job.id}>
                      <TableCell><Link to={`/atendimentos/${job.id}`} className="font-semibold text-primary hover:underline">{job.title}</Link>{job.pendingExtrasCount > 0 && <span className="mt-1 block text-xs text-warning">{job.pendingExtrasCount} pendente(s)</span>}</TableCell>
                      <TableCell>{job.clientName}</TableCell>
                      <TableCell>{formatDateTime(job.scheduledAt)}</TableCell>
                      <TableCell><Badge variant="outline" className={meta.className}>{meta.label}</Badge></TableCell>
                      <TableCell className="text-right font-semibold text-success">{formatCurrency(job.approvedTotalCents)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  )
}

function JobsSkeleton() {
  return <div className="space-y-3" aria-label="Carregando atendimentos">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}</div>
}
