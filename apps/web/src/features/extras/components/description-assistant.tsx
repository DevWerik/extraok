import { useQuery } from '@tanstack/react-query'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { queryKeys } from '@/lib/query-keys'
import { aiService, type DescriptionInput } from '@/services/ai.service'
import { isServiceError } from '@/services/errors'

interface DescriptionAssistantProps extends DescriptionInput {
  disabled: boolean
  onApply: (description: string) => void
}

export function DescriptionAssistant({ title, description, disabled, onApply }: DescriptionAssistantProps) {
  const capabilities = useQuery({
    queryKey: queryKeys.ai.capabilities,
    queryFn: ({ signal }) => aiService.capabilities(signal),
    retry: false,
    staleTime: 60_000,
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [suggestion, setSuggestion] = useState<{ input: DescriptionInput; text: string } | null>(null)
  const activeRequest = useRef<AbortController | null>(null)

  useEffect(() => () => activeRequest.current?.abort(), [])

  if (!capabilities.data?.descriptionsEnabled) return null

  const validTitle = title.trim().length >= 3 && title.trim().length <= 160
  const stale = suggestion !== null && (suggestion.input.title !== title || suggestion.input.description !== description)

  async function generate() {
    if (disabled || activeRequest.current || !validTitle) return
    const controller = new AbortController()
    activeRequest.current = controller
    setPending(true)
    setError('')
    setSuggestion(null)
    const input = { title, description }
    try {
      const result = await aiService.generateDescription(input, AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]))
      if (!controller.signal.aborted) setSuggestion({ input, text: result.description })
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(isServiceError(cause) ? cause.message : 'Não foi possível gerar a descrição. Tente novamente em instantes.')
      }
    } finally {
      if (!controller.signal.aborted) {
        activeRequest.current = null
        setPending(false)
      }
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={disabled || pending || !validTitle || description.length > 2_000} onClick={() => void generate()}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
          {pending ? 'Gerando sugestão...' : description.trim() ? 'Melhorar com IA' : 'Gerar com IA'}
        </Button>
        {!validTitle && <span className="text-xs text-muted-foreground">Preencha o título do serviço para usar a IA.</span>}
      </div>
      <p className="text-xs text-muted-foreground">Ao gerar, o título e o rascunho serão enviados ao Google Gemini. Evite incluir dados pessoais.</p>
      <div aria-live="polite" aria-atomic="true">
        {pending && <p className="text-xs text-muted-foreground">Preparando uma sugestão para você revisar.</p>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {suggestion && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">Sugestão de descrição</p>
            <p className="whitespace-pre-wrap break-words text-sm">{suggestion.text}</p>
            <p className="text-xs text-muted-foreground">Revise as informações antes de aplicar. A IA pode cometer erros.</p>
            {stale && <p className="text-xs text-muted-foreground">Você alterou o título ou a descrição. Gere uma nova sugestão com o texto atualizado.</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={disabled || stale} onClick={() => { onApply(suggestion.text); setSuggestion(null) }}>Aplicar sugestão</Button>
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setSuggestion(null)}>Descartar</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
