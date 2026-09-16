import { useQuery } from '@tanstack/react-query'
import { Download, LockKeyhole } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useBilling } from '@/features/billing/billing.queries'
import { hasPlanFeature } from '@/features/billing/plan-access'
import { useClients } from '@/features/clients/client.queries'
import { jobStatusMeta } from '@/features/jobs/job-status'
import type { JobsReport, ReportFilters } from '@/features/reports/report.types'
import { reportDateError, reportMonthDates } from '@/features/reports/report.utils'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import { isServiceError } from '@/services/errors'
import { reportsService } from '@/services/reports.service'

function ReportsUpgrade() {
  return <Card><CardContent className="space-y-4 py-6">
    <LockKeyhole className="size-8 text-success" aria-hidden="true" />
    <h3 className="text-xl font-bold text-primary">Relatórios no plano Negócio</h3>
    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Filtre atendimentos por período, cliente e status, acompanhe os extras aprovados e exporte os resultados em CSV. O plano Negócio também inclui o PDF de cada atendimento.</p>
    <Button asChild><Link to="/meu-plano">Conhecer o plano Negócio</Link></Button>
  </CardContent></Card>
}

export function ReportsPage() {
  const billing = useBilling()
  return <section aria-labelledby="reports-heading" className="space-y-6">
    <div><h2 id="reports-heading" className="text-2xl font-bold text-primary">Relatórios de atendimentos</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Consulte os atendimentos pela data agendada, no horário de Brasília. Os valores representam extras aprovados, pendentes ou recusados; não confirmam recebimentos.</p></div>
    {billing.isPending ? <p role="status">Verificando seu plano...</p>
      : billing.isError ? <div role="alert" className="space-y-3"><p>Não foi possível verificar seu plano.</p><Button variant="outline" onClick={() => void billing.refetch()}>Tentar novamente</Button></div>
      : hasPlanFeature(billing.data, 'advancedReports') ? <ReportsContent /> : <ReportsUpgrade />}
  </section>
}

function ReportsContent() {
  const billing = useBilling()
  const clients = useClients()
  const [filters, setFilters] = useState<ReportFilters>(() => ({ ...reportMonthDates(), clientId: '', status: 'all', page: 1 }))
  const [draft, setDraft] = useState(filters)
  const [formError, setFormError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const report = useQuery({ queryKey: ['reports', 'jobs', filters], queryFn: ({ signal }) => reportsService.jobs(filters, signal), staleTime: 0, retry: false })
  const accessDenied = isServiceError(report.error) && report.error.code === 'PLAN_FEATURE_REQUIRED'

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const error = reportDateError(draft.from, draft.to)
    setFormError(error)
    if (error) return
    setFilters({ ...draft, page: 1 })
  }

  async function download() {
    setDownloading(true)
    try {
      await reportsService.downloadCsv(filters)
      toast.success('CSV pronto. Confira os downloads do navegador.')
    } catch (error) {
      if (isServiceError(error) && error.code === 'PLAN_FEATURE_REQUIRED') void billing.refetch()
      toast.error(isServiceError(error) ? error.message : 'Não foi possível exportar o relatório.')
    } finally { setDownloading(false) }
  }

  if (accessDenied) return <ReportsUpgrade />
  return <>
    <form onSubmit={applyFilters} className="space-y-4 rounded-xl border bg-card p-4 sm:p-5" aria-label="Filtros do relatório">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2"><Label htmlFor="report-from">Data inicial</Label><Input id="report-from" type="date" min="2000-01-01" max="2100-12-31" required value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} aria-describedby={formError ? 'report-filter-error' : undefined} /></div>
        <div className="space-y-2"><Label htmlFor="report-to">Data final</Label><Input id="report-to" type="date" min="2000-01-01" max="2100-12-31" required value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} aria-describedby={formError ? 'report-filter-error' : undefined} /></div>
        <div className="space-y-2"><Label htmlFor="report-client">Cliente</Label><select id="report-client" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.clientId} onChange={(event) => setDraft({ ...draft, clientId: event.target.value })} disabled={clients.isPending || clients.isError}><option value="">Todos os clientes</option>{clients.data?.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="report-status">Status do atendimento</Label><select id="report-status" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as ReportFilters['status'] })}><option value="all">Todos os status</option>{Object.entries(jobStatusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></div>
      </div>
      {clients.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar os clientes. <button type="button" className="underline" onClick={() => void clients.refetch()}>Tentar novamente</button></p>}
      {formError && <p id="report-filter-error" role="alert" className="text-sm text-destructive">{formError}</p>}
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={report.isFetching}>Aplicar filtros</Button><p className="text-xs text-muted-foreground">Até 366 dias por consulta. O CSV inclui todas as páginas, até 5.000 atendimentos.</p></div>
    </form>
    {report.isPending ? <p role="status">Carregando relatório...</p>
      : report.isError ? <div role="alert" className="space-y-3"><p>{isServiceError(report.error) ? report.error.message : 'Não foi possível carregar o relatório.'}</p><Button variant="outline" onClick={() => void report.refetch()}>Tentar novamente</Button></div>
      : <>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Período aplicado: {filters.from.split('-').reverse().join('/')} a {filters.to.split('-').reverse().join('/')}{report.isFetching ? ' · Atualizando...' : ''}</p>
          <Button variant="outline" onClick={() => void download()} disabled={downloading || report.isFetching || report.data.summary.totalJobs === 0 || !hasPlanFeature(billing.data, 'csvExport')}><Download className="size-4" aria-hidden="true" />{downloading ? 'Exportando...' : 'Exportar CSV'}</Button></div>
        <ReportResults report={report.data} />
        <nav aria-label="Paginação do relatório" className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground" aria-live="polite">Página {report.data.page} de {report.data.totalPages} · {report.data.summary.totalJobs} atendimento(s)</p><div className="flex gap-2"><Button variant="outline" disabled={report.isFetching || filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Anterior</Button><Button variant="outline" disabled={report.isFetching || filters.page >= report.data.totalPages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Próxima</Button></div></nav>
      </>}
  </>
}

function ReportResults({ report }: { report: JobsReport }) {
  const summary = report.summary
  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: 'Atendimentos no período', value: String(summary.totalJobs), detail: 'Pela data agendada' },
        { label: 'Extras aprovados', value: formatCurrency(summary.approvedCents), detail: `${summary.approvedCount} extra(s) aprovado(s)` },
        { label: 'Extras pendentes', value: formatCurrency(summary.pendingCents), detail: `${summary.pendingCount} extra(s) aguardando resposta` },
        { label: 'Taxa de aprovação', value: `${summary.approvalRate.toLocaleString('pt-BR')}%`, detail: 'Entre os extras respondidos' },
      ].map((item) => <Card key={item.label}><CardContent className="space-y-2"><p className="text-sm font-semibold text-muted-foreground">{item.label}</p><p className="break-words text-2xl font-bold text-primary">{item.value}</p><p className="text-xs text-muted-foreground">{item.detail}</p></CardContent></Card>)}
    </div>
    <p className="text-sm text-muted-foreground">Extras recusados: {formatCurrency(summary.rejectedCents)} em {summary.rejectedCount} resposta(s). Os totais consideram todas as páginas dos filtros aplicados.</p>
    {report.rows.length === 0 ? <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">Nenhum atendimento encontrado para esses filtros.</p>
      : <div role="region" aria-label="Atendimentos do relatório" tabIndex={0} className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-210 text-left text-sm"><caption className="sr-only">Atendimentos do período e valores dos extras por situação</caption><thead className="bg-muted text-xs text-muted-foreground"><tr>{['Atendimento / cliente', 'Agendado (Brasília)', 'Status', 'Aprovados', 'Pendentes', 'Recusados'].map((label) => <th key={label} scope="col" className="p-4 font-semibold">{label}</th>)}</tr></thead>
          <tbody className="divide-y">{report.rows.map((row) => <tr key={row.id}><th scope="row" className="max-w-72 p-4 font-normal"><Link className="break-words font-semibold text-primary underline-offset-4 hover:underline" to={`/atendimentos/${row.id}`}>{row.title}</Link><p className="mt-1 break-words text-xs text-muted-foreground">{row.clientName}</p></th><td className="whitespace-nowrap p-4">{new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.scheduledAt))}</td><td className="p-4">{jobStatusMeta[row.status].label}</td><td className="whitespace-nowrap p-4 font-semibold text-success">{formatCurrency(row.approvedCents)}</td><td className="whitespace-nowrap p-4">{formatCurrency(row.pendingCents)}</td><td className="whitespace-nowrap p-4">{formatCurrency(row.rejectedCents)}</td></tr>)}</tbody>
        </table>
      </div>}
    <p className="text-xs text-muted-foreground">Atualizado em {formatDateTime(report.generatedAt)}.</p>
  </>
}
