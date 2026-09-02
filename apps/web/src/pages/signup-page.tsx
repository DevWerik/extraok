import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/layout/auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormFeedback } from '@/features/auth/components/form-feedback'
import { PasswordField } from '@/features/auth/components/password-field'
import { useSignUp } from '@/features/auth/auth.queries'
import { signupSchema, type SignupFormData } from '@/features/auth/schemas/auth-schemas'
import { isServiceError } from '@/services/errors'

export function SignupPage() {
  const navigate = useNavigate()
  const signUp = useSignUp()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: '',
      businessName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
    },
  })

  async function onSubmit(values: SignupFormData) {
    try {
      await signUp.mutateAsync({
        name: values.name,
        businessName: values.businessName,
        email: values.email,
        phone: values.phone,
        password: values.password,
        acceptTerms: values.acceptTerms,
      })
      toast.success('Sua conta foi criada com sucesso.')
      navigate('/dashboard', { replace: true })
    } catch {
      // The mutation error is rendered below the form.
    }
  }

  return (
    <AuthLayout
      eyebrow="Comece agora"
      title="Crie sua conta e enxergue mais valor em cada visita."
      description="Organize atendimentos, salve seus clientes e acompanhe aprovações com segurança."
      alternatePrompt="Já possui uma conta?"
      alternateLinkLabel="Entrar"
      alternateLinkTo="/login"
    >
      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <SignupField id="signup-name" label="Seu nome" error={errors.name?.message}><Input id="signup-name" autoComplete="name" aria-invalid={Boolean(errors.name)} placeholder="Marcos Almeida" {...register('name')} /></SignupField>
          <SignupField id="signup-business" label="Nome do negócio" error={errors.businessName?.message}><Input id="signup-business" autoComplete="organization" aria-invalid={Boolean(errors.businessName)} placeholder="Clima Certo" {...register('businessName')} /></SignupField>
        </div>
        <SignupField id="signup-email" label="E-mail" error={errors.email?.message}><Input id="signup-email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} placeholder="voce@empresa.com.br" {...register('email')} /></SignupField>
        <SignupField id="signup-phone" label="Telefone" error={errors.phone?.message}><Input id="signup-phone" inputMode="tel" autoComplete="tel" aria-invalid={Boolean(errors.phone)} placeholder="(11) 99999-9999" {...register('phone')} /></SignupField>
        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordField id="signup-password" label="Senha" autoComplete="new-password" registration={register('password')} error={errors.password?.message} hint="Use pelo menos 12 caracteres." />
          <PasswordField id="signup-confirm-password" label="Confirme a senha" autoComplete="new-password" registration={register('confirmPassword')} error={errors.confirmPassword?.message} />
        </div>
        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted-foreground">
            <input type="checkbox" className="mt-1 size-4 rounded border-input accent-[var(--success)]" {...register('acceptTerms')} />
            <span>Confirmo que li e concordo com o uso dos meus dados para criar e operar minha conta no ExtraOK.</span>
          </label>
          {errors.acceptTerms && <p className="mt-2 text-sm text-destructive">{errors.acceptTerms.message}</p>}
        </div>
        {signUp.isError && <FormFeedback tone="error" message={isServiceError(signUp.error) ? signUp.error.message : 'Não foi possível criar sua conta.'} />}
        <Button type="submit" size="lg" className="w-full" disabled={signUp.isPending}>{signUp.isPending ? 'Criando conta...' : 'Criar conta'}{!signUp.isPending && <ArrowRight className="size-4" />}</Button>
      </form>
    </AuthLayout>
  )
}

interface SignupFieldProps {
  id: string
  label: string
  error?: string
  children: React.ReactNode
}

function SignupField({ id, label, error, children }: SignupFieldProps) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}{error && <p className="text-sm text-destructive">{error}</p>}</div>
}
