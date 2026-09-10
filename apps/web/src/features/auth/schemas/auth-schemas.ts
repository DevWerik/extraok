import { z } from "zod"

const emailSchema = z.string().trim().email("Informe um e-mail válido.")
const loginPasswordSchema = z.string().min(1, "Informe sua senha.").max(128, "Senha inválida.")
const newPasswordSchema = z
  .string()
  .min(12, "Use pelo menos 12 caracteres.")
  .max(128, "Use no máximo 128 caracteres.")

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
})

export const signupSchema = z
  .object({
    acceptTerms: z.boolean().refine((accepted) => accepted, {
      message: "Confirme que você está de acordo para continuar.",
    }),
    businessName: z.string().trim().min(2, "Informe o nome do negócio."),
    confirmPassword: z.string(),
    email: emailSchema,
    name: z.string().trim().min(3, "Informe seu nome completo."),
    password: newPasswordSchema,
    phone: z
      .string()
      .trim()
      .regex(/^\(?\d{2}\)?[\s-]?9?\d{4}-?\d{4}$/, "Informe um telefone com DDD."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "As senhas precisam ser iguais.",
    path: ["confirmPassword"],
  })

export type LoginFormData = z.infer<typeof loginSchema>
export type SignupFormData = z.infer<typeof signupSchema>

export const passwordResetRequestSchema = z.object({
  email: emailSchema.transform((email) => email.toLowerCase()),
})

export const passwordResetCodeSchema = z.object({
  code: z.string().regex(/^\d{8}$/, "Informe os 8 dígitos do código."),
})

export const passwordResetConfirmSchema = z
  .object({
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "As senhas precisam ser iguais.",
    path: ["confirmPassword"],
  })

export type PasswordResetRequestFormData = z.infer<typeof passwordResetRequestSchema>
export type PasswordResetCodeFormData = z.infer<typeof passwordResetCodeSchema>
export type PasswordResetConfirmFormData = z.infer<typeof passwordResetConfirmSchema>
