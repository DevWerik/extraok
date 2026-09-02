import { z } from 'zod'
import { parseCurrencyInputToCents } from '@/lib/currency'

export const extraSchema = z.object({
  title: z.string().trim().min(3, 'Informe um título com pelo menos 3 caracteres.'),
  description: z.string().trim().min(8, 'Descreva o benefício deste serviço.'),
  price: z.string().trim().refine((value) => {
    const cents = parseCurrencyInputToCents(value)
    return cents !== null && cents > 0
  }, 'Informe um valor maior que zero.'),
})

export type ExtraFormValues = z.infer<typeof extraSchema>
