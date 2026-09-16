import { ChevronDown, LogOut, Menu, ShieldCheck, UserRound } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSession, useSignOut } from '@/features/auth/auth.queries'
import { isServiceError } from '@/services/errors'

const pageDetails = [
  { match: /^\/dashboard$/, title: 'Visão geral', eyebrow: 'Seu negócio hoje' },
  { match: /^\/clientes$/, title: 'Clientes', eyebrow: 'Relacionamentos' },
  { match: /^\/meu-plano$/, title: 'Meu plano', eyebrow: 'Planos e pagamentos' },
  { match: /^\/relatorios$/, title: 'Relatórios', eyebrow: 'Resultados do negócio' },
  { match: /^\/atendimentos\/novo$/, title: 'Novo atendimento', mobileTitle: 'Novo atendimento', eyebrow: 'Atendimentos' },
  { match: /^\/atendimentos\/[^/]+$/, title: 'Detalhes do atendimento', mobileTitle: 'Atendimento', eyebrow: 'Atendimentos' },
  { match: /^\/atendimentos$/, title: 'Atendimentos', eyebrow: 'Operação' },
]

interface AppHeaderProps {
  onOpenMenu: () => void
}

export function AppHeader({ onOpenMenu }: AppHeaderProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const session = useSession()
  const signOut = useSignOut()
  const current = pageDetails.find(({ match }) => match.test(pathname)) ?? {
    title: 'ExtraOK',
    eyebrow: 'Área do prestador',
  }
  const user = session.data?.user

  async function handleSignOut() {
    try {
      await signOut.mutateAsync()
      toast.success('Você saiu da sua conta com segurança.')
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(isServiceError(error) ? error.message : 'Não foi possível sair da conta.')
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="flex min-h-18 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onOpenMenu}
          aria-label="Abrir menu"
        >
          <Menu className="size-5" />
        </Button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold uppercase tracking-[0.14em] text-success">{current.eyebrow}</p>
          <h1 className="text-lg font-bold text-primary sm:text-xl">
            <span className="sm:hidden">{'mobileTitle' in current ? current.mobileTitle : current.title}</span>
            <span className="hidden sm:inline">{current.title}</span>
          </h1>
        </div>

        <Badge variant="outline" className="hidden border-success/25 bg-success-soft text-success md:inline-flex">
          <ShieldCheck className="size-3.5" />
          Conta protegida
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-11 gap-2 px-2 sm:px-3" aria-label="Abrir menu do perfil">
              <span className="grid size-8 place-items-center rounded-full bg-primary text-white">
                <UserRound className="size-4" />
              </span>
              <span className="hidden text-left sm:block">
                <span className="block max-w-40 truncate text-sm font-semibold leading-tight">{user?.name ?? 'Minha conta'}</span>
                <span className="block max-w-40 truncate text-xs font-normal text-muted-foreground">{user?.businessName ?? ''}</span>
              </span>
              <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <span className="block truncate">{user?.name ?? 'Conta ExtraOK'}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">{user?.email ?? ''}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/dashboard">Visão geral</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/meu-plano">Meu plano</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void handleSignOut()}
              disabled={signOut.isPending}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="size-4" />
              {signOut.isPending ? 'Saindo...' : 'Sair da conta'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
