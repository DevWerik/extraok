import { z } from 'zod'

export const clientSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome completo.'),
  phone: z.string().trim().min(10, 'Informe um telefone válido.'),
  email: z.email('Informe um e-mail válido.'),
  notes: z.string().trim().max(500, 'Use no máximo 500 caracteres.'),
})

export type ClientFormValues = z.infer<typeof clientSchema>
