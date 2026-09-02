import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { extraSchema, type ExtraFormValues } from '@/features/extras/extra.schema'

interface ExtraFormProps {
  formId: string
  initialValues?: ExtraFormValues
  disabled?: boolean
  onSubmit: (values: ExtraFormValues) => void | Promise<void>
}

const emptyValues: ExtraFormValues = { title: '', description: '', price: '' }

export function ExtraForm({ formId, initialValues, disabled = false, onSubmit }: ExtraFormProps) {
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<ExtraFormValues>({
    resolver: zodResolver(extraSchema),
    defaultValues: initialValues ?? emptyValues,
  })

  useEffect(() => {
    reset(initialValues ?? emptyValues)
  }, [initialValues, reset])

  return (
    <form id={formId} className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-2">
        <Label htmlFor={`${formId}-title`}>Título do extra</Label>
        <Input id={`${formId}-title`} placeholder="Ex.: Higienização completa" aria-invalid={Boolean(errors.title)} disabled={disabled} {...register('title')} />
        {errors.title && <p className="text-xs font-medium text-destructive">{errors.title.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${formId}-description`}>Descrição</Label>
        <Textarea id={`${formId}-description`} rows={4} placeholder="Explique com clareza o que será feito e o benefício para o cliente." aria-invalid={Boolean(errors.description)} disabled={disabled} {...register('description')} />
        {errors.description && <p className="text-xs font-medium text-destructive">{errors.description.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${formId}-price`}>Valor</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">R$</span>
          <Input id={`${formId}-price`} inputMode="decimal" placeholder="0,00" className="pl-10" aria-invalid={Boolean(errors.price)} disabled={disabled} {...register('price')} />
        </div>
        <p className="text-xs text-muted-foreground">O valor é armazenado em centavos para evitar diferenças de arredondamento.</p>
        {errors.price && <p className="text-xs font-medium text-destructive">{errors.price.message}</p>}
      </div>
    </form>
  )
}
