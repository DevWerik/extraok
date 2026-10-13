import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  clientSchema,
  type ClientFormValues,
} from '@/features/clients/client.schema'

interface ClientFormProps {
  formId: string
  initialValues?: ClientFormValues
  disabled?: boolean
  onSubmit: (values: ClientFormValues) => void | Promise<void>
}

const emptyValues: ClientFormValues = {
  name: '',
  phone: '',
  email: '',
  notes: '',
}

export function ClientForm({
  formId,
  initialValues,
  disabled = false,
  onSubmit,
}: ClientFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: initialValues ?? emptyValues,
  })
  const notes = useWatch({ control, name: 'notes' }) ?? ''
  const notesMaxLength = clientSchema.shape.notes.maxLength ?? undefined

  useEffect(() => {
    reset(initialValues ?? emptyValues)
  }, [initialValues, reset])

  return (
    <form id={formId} className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormField label="Nome completo" error={errors.name?.message} htmlFor={`${formId}-name`}>
        <Input
          id={`${formId}-name`}
          autoComplete="name"
          placeholder="Ex.: Juliana Ferreira"
          aria-invalid={Boolean(errors.name)}
          disabled={disabled}
          {...register('name')}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Telefone" error={errors.phone?.message} htmlFor={`${formId}-phone`}>
          <Input
            id={`${formId}-phone`}
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 99999-9999"
            aria-invalid={Boolean(errors.phone)}
            disabled={disabled}
            {...register('phone')}
          />
        </FormField>
        <FormField label="E-mail" error={errors.email?.message} htmlFor={`${formId}-email`}>
          <Input
            id={`${formId}-email`}
            type="email"
            autoComplete="email"
            placeholder="cliente@email.com"
            aria-invalid={Boolean(errors.email)}
            disabled={disabled}
            {...register('email')}
          />
        </FormField>
      </div>

      <FormField label="Observações" error={errors.notes?.message} htmlFor={`${formId}-notes`}>
        <Textarea
          id={`${formId}-notes`}
          rows={4}
          maxLength={notesMaxLength}
          placeholder="Preferências de horário, acesso ao local ou outros detalhes úteis."
          aria-invalid={Boolean(errors.notes)}
          aria-describedby={`${formId}-notes-help${errors.notes ? ` ${formId}-notes-error` : ''}`}
          disabled={disabled}
          {...register('notes')}
        />
        <p id={`${formId}-notes-help`} className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Máximo de {notesMaxLength?.toLocaleString('pt-BR')} caracteres.</span>
          <span className="tabular-nums">{notes.length.toLocaleString('pt-BR')} / {notesMaxLength?.toLocaleString('pt-BR')} caracteres</span>
        </p>
      </FormField>
    </form>
  )
}

interface FormFieldProps {
  label: string
  htmlFor: string
  error?: string
  children: React.ReactNode
}

function FormField({ label, htmlFor, error, children }: FormFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p id={`${htmlFor}-error`} className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  )
}
