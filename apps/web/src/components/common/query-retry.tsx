import { Button } from '@/components/ui/button'
import { useRetryCountdown } from '@/lib/use-retry-countdown'
import { isServiceError } from '@/services/errors'

interface QueryRetryProps {
  error: unknown
  isFetching: boolean
  onRetry: () => void
  fallbackMessage: string
}

export function QueryRetry({ error, isFetching, onRetry, fallbackMessage }: QueryRetryProps) {
  const retryAt = isServiceError(error) ? error.retryAt ?? 0 : 0
  const seconds = useRetryCountdown(retryAt)

  return (
    <div>
      <p className="text-sm text-muted-foreground" role="status">
        {isServiceError(error) ? error.message : fallbackMessage}
      </p>
      <Button variant="outline" className="mt-3" disabled={isFetching || seconds > 0} onClick={onRetry}>
        {isFetching ? 'Tentando novamente…' : seconds > 0 ? `Tentar novamente em ${seconds}s` : 'Tentar novamente'}
      </Button>
    </div>
  )
}
