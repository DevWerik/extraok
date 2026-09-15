import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Mail } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/layout/auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormFeedback } from '@/features/auth/components/form-feedback'
import { PasswordField } from '@/features/auth/components/password-field'
import { useSignIn } from '@/features/auth/auth.queries'
import { loginSchema, type LoginFormData } from '@/features/auth/schemas/auth-schemas'
import { isServiceError } from '@/services/errors'

const JOB_DETAILS_PATH = /^\/atendimentos\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PRIVATE_PATHS = new Set([
  '/dashboard',
  '/clientes',
  '/atendimentos',
  '/atendimentos/novo',
  '/meu-plano',
])

function safeLoginDestination(requestedPath: string | null): string {
  if (!requestedPath || requestedPath.includes('\\')) return '/dashboard'

  try {
    const destination = new URL(requestedPath, window.location.origin)
    const isPrivatePath =
      PRIVATE_PATHS.has(destination.pathname) || JOB_DETAILS_PATH.test(destination.pathname)

    if (destination.origin !== window.location.origin || !isPrivatePath) {
      return '/dashboard'
    }

    return `${destination.pathname}${destination.search}`
  } catch {
    return '/dashboard'
  }
}

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const signIn = useSignIn()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginFormData) {
    try {
      await signIn.mutateAsync(values)
      toast.success('Bem-vindo de volta ao ExtraOK.')
      navigate(safeLoginDestination(searchParams.get('from')), { replace: true })
    } catch {
      // The mutation error is rendered below the form.
    }
  }

  return (
    <AuthLayout
      eyebrow="Acesse sua conta"
      title="Continue transformando atendimentos em oportunidades."
      description="Entre para acompanhar clientes, serviços e aprovações em um só lugar."
      alternatePrompt="Ainda não tem uma conta?"
      alternateLinkLabel="Criar conta"
      alternateLinkTo="/cadastro"
    >
      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        {searchParams.get('passwordReset') === 'success' && (
          <FormFeedback tone="success" message="Senha alterada com sucesso. Entre com sua nova senha." />
        )}
        <div className="space-y-2">
          <Label htmlFor="login-email">E-mail</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="login-email" type="email" autoComplete="email" className="pl-9" aria-invalid={Boolean(errors.email)} {...register('email')} />
          </div>
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <PasswordField id="login-password" label="Senha" autoComplete="current-password" registration={register('password')} error={errors.password?.message} />
        <div className="text-right">
          <Link to="/recuperar-senha" className="inline-flex min-h-10 items-center rounded-sm text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Esqueci minha senha
          </Link>
        </div>
        {signIn.isError && <FormFeedback tone="error" message={isServiceError(signIn.error) ? signIn.error.message : 'Não foi possível entrar na sua conta.'} />}
        <Button type="submit" size="lg" className="w-full" disabled={signIn.isPending}>
          {signIn.isPending ? 'Entrando...' : 'Entrar'}
          {!signIn.isPending && <ArrowRight className="size-4" />}
        </Button>
      </form>
    </AuthLayout>
  )
}
