import {
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRoundPlus,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/empty-state'
import { ResponsiveFormSurface } from '@/components/common/responsive-form-surface'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ClientForm } from '@/features/clients/components/client-form'
import type { ClientFormValues } from '@/features/clients/client.schema'
import {
  useClients,
  useCreateClient,
  useDeleteClient,
  useUpdateClient,
} from '@/features/clients/client.queries'
import { isServiceError } from '@/services/errors'
import type { Client } from '@/types/domain'

export function ClientsPage() {
  const [search, setSearch] = useState('')
  const [surfaceOpen, setSurfaceOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [deletingClient, setDeletingClient] = useState<Client | null>(null)
  const clients = useClients({ search })
  const createClient = useCreateClient()
  const updateClient = useUpdateClient()
  const deleteClient = useDeleteClient()
  const isSaving = createClient.isPending || updateClient.isPending
  const formId = 'client-form'

  function openCreate() {
    setEditingClient(null)
    setSurfaceOpen(true)
  }

  function openEdit(client: Client) {
    setEditingClient(client)
    setSurfaceOpen(true)
  }

  async function handleSave(values: ClientFormValues) {
    try {
      if (editingClient) {
        await updateClient.mutateAsync({ id: editingClient.id, input: values })
        toast.success('Cliente atualizado com sucesso.')
      } else {
        await createClient.mutateAsync(values)
        toast.success('Cliente cadastrado com sucesso.')
      }
      setSurfaceOpen(false)
    } catch (error) {
      toast.error(isServiceError(error) ? error.message : 'Não foi possível salvar o cliente.')
    }
  }

  async function handleDelete() {
    if (!deletingClient) return
    try {
      await deleteClient.mutateAsync(deletingClient.id)
      toast.success('Cliente excluído.')
      setDeletingClient(null)
    } catch (error) {
      toast.error(isServiceError(error) ? error.message : 'Não foi possível excluir o cliente.')
    }
  }

  return (
    <section aria-labelledby="clients-heading" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="clients-heading" className="text-2xl font-extrabold tracking-tight text-primary sm:text-3xl">Clientes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Organize os contatos que recebem suas propostas de extras.</p>
        </div>
        <Button size="lg" onClick={openCreate}>
          <UserRoundPlus className="size-4" />
          Cadastrar cliente
        </Button>
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
          placeholder="Buscar por nome, telefone ou e-mail"
          aria-label="Buscar clientes"
        />
      </div>

      {clients.isLoading ? (
        <ClientsSkeleton />
      ) : clients.isError ? (
        <EmptyState
          icon={<Users />}
          title="Não foi possível carregar os clientes"
          description="Verifique sua conexão e tente novamente."
          action={<Button variant="outline" onClick={() => clients.refetch()}>Tentar novamente</Button>}
        />
      ) : !clients.data?.length ? (
        <EmptyState
          icon={<Users />}
          title={search ? 'Nenhum cliente encontrado' : 'Sua lista de clientes está vazia'}
          description={search ? 'Tente outro nome, telefone ou e-mail.' : 'Cadastre o primeiro cliente para criar um atendimento.'}
          action={!search ? <Button onClick={openCreate}><Plus className="size-4" />Cadastrar cliente</Button> : undefined}
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {clients.data.map((client) => (
              <article key={client.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-primary">{client.name}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{client.notes || 'Sem observações.'}</p>
                  </div>
                  <ClientActions client={client} onEdit={openEdit} onDelete={setDeletingClient} />
                </div>
                <div className="mt-4 space-y-2 border-t pt-3 text-sm">
                  <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-primary">
                    <Phone className="size-4" /> {client.phone}
                  </a>
                  <a href={`mailto:${client.email}`} className="flex min-w-0 items-center gap-2 text-muted-foreground hover:text-primary">
                    <Mail className="size-4 shrink-0" /> <span className="truncate">{client.email}</span>
                  </a>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Observações</TableHead>
                  <TableHead className="w-16"><span className="sr-only">Ações</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.data.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-semibold text-primary">{client.name}</TableCell>
                    <TableCell>{client.phone}</TableCell>
                    <TableCell>{client.email}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{client.notes || '—'}</TableCell>
                    <TableCell><ClientActions client={client} onEdit={openEdit} onDelete={setDeletingClient} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <ResponsiveFormSurface
        open={surfaceOpen}
        onOpenChange={setSurfaceOpen}
        title={editingClient ? 'Editar cliente' : 'Cadastrar cliente'}
        description="Mantenha os dados de contato atualizados para enviar aprovações."
        contentClassName="md:max-w-2xl max-h-[92svh]"
        footer={
          <>
            <Button variant="outline" onClick={() => setSurfaceOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button type="submit" form={formId} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar cliente'}</Button>
          </>
        }
      >
        <ClientForm
          formId={formId}
          disabled={isSaving}
          initialValues={editingClient ? {
            name: editingClient.name,
            phone: editingClient.phone,
            email: editingClient.email,
            notes: editingClient.notes,
          } : undefined}
          onSubmit={handleSave}
        />
      </ResponsiveFormSurface>

      <Dialog open={Boolean(deletingClient)} onOpenChange={(open) => !open && setDeletingClient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir cliente?</DialogTitle>
            <DialogDescription>
              {deletingClient?.name} será removido. Clientes vinculados a atendimentos são preservados para manter o histórico.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingClient(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteClient.isPending}>
              <Trash2 className="size-4" />
              {deleteClient.isPending ? 'Excluindo...' : 'Excluir cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

interface ClientActionsProps {
  client: Client
  onEdit: (client: Client) => void
  onDelete: (client: Client) => void
}

function ClientActions({ client, onEdit, onDelete }: ClientActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${client.name}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(client)}><Pencil className="size-4" />Editar</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDelete(client)} className="text-destructive"><Trash2 className="size-4" />Excluir</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ClientsSkeleton() {
  return (
    <div className="space-y-3" aria-label="Carregando clientes">
      {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)}
    </div>
  )
}
