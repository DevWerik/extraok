import { z } from 'zod'

export const jobSchema = z.object({
  clientId: z.string().min(1, 'Selecione um cliente.'),
  title: z.string().trim().min(3, 'Informe um título com pelo menos 3 caracteres.').max(160, 'O título deve ter no máximo 160 caracteres.'),
  description: z.string().trim().min(10, 'Descreva o serviço em pelo menos 10 caracteres.').max(2_000, 'A descrição deve ter no máximo 2.000 caracteres.'),
  scheduledAt: z
    .string()
    .min(1, 'Informe a data e o horário.')
    .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Informe uma data válida.'),
})

export type JobFormValues = z.infer<typeof jobSchema>
