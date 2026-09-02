import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useClients } from '@/features/clients/client.queries'
import { jobSchema, type JobFormValues } from '@/features/jobs/job.schema'

interface JobFormProps {
  formId: string
  disabled?: boolean
  onSubmit: (values: JobFormValues) => void | Promise<void>
}

export function JobForm({ formId, disabled = false, onSubmit }: JobFormProps) {
  const clients = useClients()
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<JobFormValues>({
    resolver: zodResolver(jobSchema),
    defaultValues: { clientId: '', title: '', description: '', scheduledAt: '' },
  })

  return (
    <form id={formId} className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-2">
        <Label htmlFor={`${formId}-client`}>Cliente</Label>
        <Controller
          name="clientId"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={disabled || clients.isLoading}>
              <SelectTrigger id={`${formId}-client`} aria-invalid={Boolean(errors.clientId)}>
                <SelectValue placeholder={clients.isLoading ? 'Carregando clientes...' : 'Selecione um cliente'} />
              </SelectTrigger>
              <SelectContent>
                {clients.data?.map((client) => (
                  <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.clientId && <p className="text-xs font-medium text-destructive">{errors.clientId.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-title`}>Título do serviço</Label>
        <Input
          id={`${formId}-title`}
          placeholder="Ex.: Manutenção preventiva do ar-condicionado"
          aria-invalid={Boolean(errors.title)}
          disabled={disabled}
          {...register('title')}
        />
        {errors.title && <p className="text-xs font-medium text-destructive">{errors.title.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-description`}>Descrição</Label>
        <Textarea
          id={`${formId}-description`}
          rows={4}
          placeholder="Explique o que será realizado no atendimento."
          aria-invalid={Boolean(errors.description)}
          disabled={disabled}
          {...register('description')}
        />
        {errors.description && <p className="text-xs font-medium text-destructive">{errors.description.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-scheduledAt`}>Data e horário</Label>
        <Input
          id={`${formId}-scheduledAt`}
          type="datetime-local"
          aria-invalid={Boolean(errors.scheduledAt)}
          disabled={disabled}
          {...register('scheduledAt')}
        />
        {errors.scheduledAt && <p className="text-xs font-medium text-destructive">{errors.scheduledAt.message}</p>}
      </div>
    </form>
  )
}
