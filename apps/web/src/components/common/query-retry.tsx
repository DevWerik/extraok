import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { isServiceError } from '@/services/errors'

interface QueryRetryProps {
  error: unknown
  isFetching: boolean
  onRetry: () => void
  fallbackMessage: string
}

export function QueryRetry({ error, isFetching, onRetry, fallbackMessage }: QueryRetryProps) {
  const [now, setNow] = useState(() => Date.now())
  const retryAt = isServiceError(error) ? error.retryAt ?? 0 : 0
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1_000))

  useEffect(() => {
    if (!retryAt) return
    const update = () => setNow(Date.now())
    const timer = window.setInterval(update, 1_000)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [retryAt])

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
