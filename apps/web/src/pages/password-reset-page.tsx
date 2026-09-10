import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/layout/auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  useConfirmPasswordReset,
  useRequestPasswordReset,
  useVerifyPasswordReset,
} from '@/features/auth/auth.queries'
import { FormFeedback } from '@/features/auth/components/form-feedback'
import { PasswordField } from '@/features/auth/components/password-field'
import {
  formatCountdown,
  normalizePasswordResetCode,
  remainingSeconds,
} from '@/features/auth/password-reset.utils'
import {
  passwordResetCodeSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  type PasswordResetCodeFormData,
  type PasswordResetConfirmFormData,
  type PasswordResetRequestFormData,
} from '@/features/auth/schemas/auth-schemas'
import type { PasswordResetRequestResult } from '@/services/contracts'
import { isServiceError } from '@/services/errors'

type RecoveryState =
  | { step: 'email'; email: string }
  | { step: 'code'; email: string; expiresAt: number; resendAt: number; message: string }
  | { step: 'password'; email: string; expiresAt: number }

const steps = ['E-mail', 'Código', 'Nova senha']

function useCountdown(deadline: number) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const update = () => setNow(Date.now())
    const timer = window.setInterval(update, 1_000)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  return remainingSeconds(deadline, now)
}

function RecoveryError({ error }: { error: unknown }) {
  return (
    <FormFeedback
      tone="error"
      message={isServiceError(error) ? error.message : 'Não foi possível concluir a solicitação. Tente novamente.'}
    />
  )
}

export function PasswordResetPage() {
  const [recovery, setRecovery] = useState<RecoveryState>({ step: 'email', email: '' })
  const stepIndex = recovery.step === 'email' ? 0 : recovery.step === 'code' ? 1 : 2

  function codeRequested(email: string, result: PasswordResetRequestResult) {
    const now = Date.now()
    setRecovery({
      step: 'code',
      email,
      message: result.message,
      expiresAt: now + result.expiresInSeconds * 1_000,
      resendAt: now + result.retryAfterSeconds * 1_000,
    })
  }

  return (
    <AuthLayout
      eyebrow="Recupere seu acesso"
      title="Vamos criar uma nova senha."
      description="Use o e-mail da sua conta para receber um código de recuperação."
      alternatePrompt="Lembrou sua senha?"
      alternateLinkLabel="Entrar"
      alternateLinkTo="/login"
    >
      <ol aria-label="Etapas da recuperação de senha" className="mb-7 flex gap-3 text-xs sm:gap-5 sm:text-sm">
        {steps.map((label, index) => (
          <li key={label} aria-current={index === stepIndex ? 'step' : undefined} className={`flex flex-1 items-center gap-2 ${index === stepIndex ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
            <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full ${index === stepIndex ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {recovery.step === 'email' && <RequestCodeForm initialEmail={recovery.email} onRequested={codeRequested} />}
      {recovery.step === 'code' && (
        <VerifyCodeForm
          recovery={recovery}
          onRequested={codeRequested}
          onChangeEmail={() => setRecovery({ step: 'email', email: recovery.email })}
          onVerified={(expiresInSeconds) => setRecovery({ step: 'password', email: recovery.email, expiresAt: Date.now() + expiresInSeconds * 1_000 })}
        />
      )}
      {recovery.step === 'password' && (
        <NewPasswordForm expiresAt={recovery.expiresAt} onRestart={() => setRecovery({ step: 'email', email: recovery.email })} />
      )}
    </AuthLayout>
  )
}

function RequestCodeForm({ initialEmail, onRequested }: {
  initialEmail: string
  onRequested: (email: string, result: PasswordResetRequestResult) => void
}) {
  const requestCode = useRequestPasswordReset()
  const { register, handleSubmit, setFocus, formState: { errors } } = useForm<PasswordResetRequestFormData>({
    resolver: zodResolver(passwordResetRequestSchema),
    defaultValues: { email: initialEmail },
  })

  useEffect(() => { setFocus('email') }, [setFocus])

  async function onSubmit(values: PasswordResetRequestFormData) {
    try {
      const result = await requestCode.mutateAsync(values)
      onRequested(values.email, result)
    } catch {
      // Display the API error without changing steps.
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      <fieldset disabled={requestCode.isPending} className="space-y-5">
        <legend className="sr-only">Informe seu e-mail</legend>
        <div className="space-y-2">
          <Label htmlFor="recovery-email">E-mail da conta</Label>
          <div className="relative">
            <Mail aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="recovery-email" type="email" autoComplete="email" className="pl-9" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'recovery-email-error' : undefined} {...register('email')} />
          </div>
          {errors.email && <p id="recovery-email-error" className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        {requestCode.isError && <RecoveryError error={requestCode.error} />}
        <Button type="submit" size="lg" className="w-full" disabled={requestCode.isPending}>
          {requestCode.isPending ? 'Solicitando código...' : 'Enviar código'}
          {!requestCode.isPending && <ArrowRight aria-hidden="true" className="size-4" />}
        </Button>
      </fieldset>
    </form>
  )
}

function VerifyCodeForm({ recovery, onRequested, onVerified, onChangeEmail }: {
  recovery: Extract<RecoveryState, { step: 'code' }>
  onRequested: (email: string, result: PasswordResetRequestResult) => void
  onVerified: (expiresInSeconds: number) => void
  onChangeEmail: () => void
}) {
  const requestCode = useRequestPasswordReset()
  const verifyCode = useVerifyPasswordReset()
  const expiresIn = useCountdown(recovery.expiresAt)
  const resendIn = useCountdown(recovery.resendAt)
  const isBusy = requestCode.isPending || verifyCode.isPending
  const { register, handleSubmit, reset, setFocus, setValue, formState: { errors } } = useForm<PasswordResetCodeFormData>({
    resolver: zodResolver(passwordResetCodeSchema),
    defaultValues: { code: '' },
  })

  useEffect(() => { setFocus('code') }, [setFocus, recovery.expiresAt])

  async function onSubmit(values: PasswordResetCodeFormData) {
    if (expiresIn === 0 || isBusy) return
    requestCode.reset()
    try {
      const result = await verifyCode.mutateAsync({ email: recovery.email, code: values.code })
      reset()
      verifyCode.reset()
      onVerified(result.expiresInSeconds)
    } catch {
      // Keep the same challenge available for another attempt or resend.
    }
  }

  async function resendCode() {
    if (resendIn > 0 || isBusy) return
    verifyCode.reset()
    try {
      const result = await requestCode.mutateAsync({ email: recovery.email })
      reset()
      onRequested(recovery.email, result)
      setFocus('code')
    } catch {
      // A failed resend does not erase the current challenge.
    }
  }

  return (
    <div className="space-y-5">
      <FormFeedback tone="success" message={recovery.message} />
      <p className="break-words text-sm text-muted-foreground">E-mail informado: <span className="font-medium text-foreground">{recovery.email}</span>. Verifique também a pasta de spam.</p>
      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <fieldset disabled={isBusy || expiresIn === 0} className="space-y-5">
          <legend className="sr-only">Valide o código recebido por e-mail</legend>
          <div className="space-y-2">
            <Label htmlFor="recovery-code">Código de 8 dígitos</Label>
            <Input
              {...register('code')}
              id="recovery-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{8}"
              maxLength={8}
              className="text-center text-xl tracking-[0.35em]"
              placeholder="00000000"
              aria-invalid={Boolean(errors.code)}
              aria-describedby={errors.code ? 'recovery-code-error' : 'recovery-code-hint'}
              onChange={(event) => setValue('code', normalizePasswordResetCode(event.target.value), { shouldValidate: false, shouldDirty: true })}
              onPaste={(event) => {
                event.preventDefault()
                setValue('code', normalizePasswordResetCode(event.clipboardData.getData('text')), { shouldValidate: true, shouldDirty: true })
              }}
            />
            {errors.code && <p id="recovery-code-error" className="text-sm text-destructive">{errors.code.message}</p>}
            <p id="recovery-code-hint" className="text-sm text-muted-foreground">Você pode colar o código completo. Use o código mais recente.</p>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={isBusy || expiresIn === 0}>{verifyCode.isPending ? 'Validando código...' : 'Validar código'}</Button>
        </fieldset>
        {verifyCode.isError && <RecoveryError error={verifyCode.error} />}
      </form>
      {expiresIn === 0
        ? <FormFeedback tone="error" message="O prazo deste código terminou. Solicite um novo código para continuar." />
        : <p className="text-sm text-muted-foreground">Prazo para usar o código: <span className="tabular-nums">{formatCountdown(expiresIn)}</span>.</p>}
      {requestCode.isError && <RecoveryError error={requestCode.error} />}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="flex-1" disabled={isBusy || resendIn > 0} onClick={resendCode}>
          {requestCode.isPending ? 'Solicitando código...' : resendIn > 0 ? `Reenviar em ${formatCountdown(resendIn)}` : 'Reenviar código'}
        </Button>
        <Button variant="ghost" disabled={isBusy} onClick={onChangeEmail}>Trocar e-mail</Button>
      </div>
    </div>
  )
}

function NewPasswordForm({ expiresAt, onRestart }: { expiresAt: number; onRestart: () => void }) {
  const navigate = useNavigate()
  const confirmPassword = useConfirmPasswordReset()
  const expiresIn = useCountdown(expiresAt)
  const { register, handleSubmit, reset, setFocus, formState: { errors } } = useForm<PasswordResetConfirmFormData>({
    resolver: zodResolver(passwordResetConfirmSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  useEffect(() => { setFocus('password') }, [setFocus])

  async function onSubmit(values: PasswordResetConfirmFormData) {
    if (expiresIn === 0 || confirmPassword.isPending) return
    try {
      await confirmPassword.mutateAsync(values)
      reset()
      confirmPassword.reset()
      navigate('/login?passwordReset=success', { replace: true })
    } catch {
      // The API also checks expiration and use of the temporary authorization.
    }
  }

  return (
    <div className="space-y-5">
      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <fieldset disabled={confirmPassword.isPending || expiresIn === 0} className="space-y-5">
          <legend className="sr-only">Escolha sua nova senha</legend>
          <PasswordField id="recovery-password" label="Nova senha" autoComplete="new-password" registration={register('password')} error={errors.password?.message} hint="Use de 12 a 128 caracteres." />
          <PasswordField id="recovery-confirm-password" label="Confirme a nova senha" autoComplete="new-password" registration={register('confirmPassword')} error={errors.confirmPassword?.message} />
          <p className="text-sm text-muted-foreground">Após a alteração, entre novamente com a nova senha em todos os seus dispositivos.</p>
          <Button type="submit" size="lg" className="w-full" disabled={confirmPassword.isPending || expiresIn === 0}>{confirmPassword.isPending ? 'Salvando nova senha...' : 'Salvar nova senha'}</Button>
        </fieldset>
        {confirmPassword.isError && <RecoveryError error={confirmPassword.error} />}
      </form>
      {expiresIn === 0
        ? <FormFeedback tone="error" message="O prazo para alterar a senha terminou. Reinicie a recuperação para receber outro código." />
        : <p className="text-sm text-muted-foreground">Conclua em <span className="tabular-nums">{formatCountdown(expiresIn)}</span>.</p>}
      <Button variant="ghost" className="w-full" disabled={confirmPassword.isPending} onClick={onRestart}>Recomeçar recuperação</Button>
    </div>
  )
}
