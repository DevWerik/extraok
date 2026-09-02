import { BriefcaseBusiness, LayoutDashboard, LogOut, ShieldCheck, Users } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Brand } from '@/components/layout/brand'
import { useSession, useSignOut } from '@/features/auth/auth.queries'
import { cn } from '@/lib/utils'
import { isServiceError } from '@/services/errors'

const navItems = [
  { to: '/dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/atendimentos', label: 'Atendimentos', icon: BriefcaseBusiness },
]

interface AppSidebarProps {
  onNavigate?: () => void
}

export function AppSidebar({ onNavigate }: AppSidebarProps) {
  const navigate = useNavigate()
  const session = useSession()
  const signOut = useSignOut()

  async function handleSignOut() {
    try {
      await signOut.mutateAsync()
      onNavigate?.()
      toast.success('Você saiu da sua conta com segurança.')
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(isServiceError(error) ? error.message : 'Não foi possível sair da conta.')
    }
  }

  return (
    <div className="flex h-full flex-col bg-sidebar px-4 py-5 text-sidebar-foreground">
      <Brand inverse className="mb-9 px-2" />

      <nav aria-label="Navegação principal" className="space-y-1.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-semibold text-sidebar-muted transition-colors hover:bg-sidebar-active hover:text-white focus-visible:outline-white',
                isActive && 'bg-sidebar-active text-white shadow-sm',
              )
            }
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <ShieldCheck className="size-4 text-emerald-300" />
          Sessão segura
        </p>
        <p className="mt-1 truncate text-xs text-sidebar-muted">{session.data?.user.email}</p>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signOut.isPending}
          className="mt-3 inline-flex items-center gap-2 rounded-lg text-xs font-semibold text-white hover:underline disabled:cursor-wait disabled:opacity-60"
        >
          <LogOut className="size-4" aria-hidden="true" />
          {signOut.isPending ? 'Saindo...' : 'Sair da conta'}
        </button>
      </div>
    </div>
  )
}
