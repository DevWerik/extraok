import { ArrowLeft, CalendarPlus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { JobForm } from '@/features/jobs/components/job-form'
import type { JobFormValues } from '@/features/jobs/job.schema'
import { useCreateJob } from '@/features/jobs/job.queries'
import { isServiceError } from '@/services/errors'

export function NewJobPage() {
  const navigate = useNavigate()
  const createJob = useCreateJob()
  const formId = 'new-job-form'

  async function handleSubmit(values: JobFormValues) {
    try {
      const job = await createJob.mutateAsync({
        ...values,
        scheduledAt: new Date(values.scheduledAt).toISOString(),
      })
      toast.success('Atendimento criado. Agora você já pode oferecer extras.')
      navigate(`/atendimentos/${job.id}`)
    } catch (error) {
      toast.error(isServiceError(error) ? error.message : 'Não foi possível criar o atendimento.')
    }
  }

  return (
    <section aria-labelledby="new-job-heading" className="mx-auto max-w-3xl space-y-5">
      <Button asChild variant="ghost" className="-ml-3"><Link to="/atendimentos"><ArrowLeft className="size-4" />Voltar aos atendimentos</Link></Button>
      <div>
        <h2 id="new-job-heading" className="text-2xl font-extrabold tracking-tight text-primary sm:text-3xl">Novo atendimento</h2>
        <p className="mt-1 text-sm text-muted-foreground">Registre o serviço principal. Os extras poderão ser adicionados em seguida.</p>
      </div>
      <Card>
        <CardHeader>
          <span className="mb-2 grid size-10 place-items-center rounded-xl bg-success-soft text-success"><CalendarPlus className="size-5" /></span>
          <CardTitle>Dados do atendimento</CardTitle>
          <CardDescription>Informe o cliente, o serviço combinado e quando ele será realizado.</CardDescription>
        </CardHeader>
        <CardContent>
          <JobForm formId={formId} disabled={createJob.isPending} onSubmit={handleSubmit} />
          <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
            <Button asChild variant="outline"><Link to="/atendimentos">Cancelar</Link></Button>
            <Button type="submit" form={formId} disabled={createJob.isPending}>{createJob.isPending ? 'Criando...' : 'Criar atendimento'}</Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
