import { useEffect, useState } from 'react'

export function useRetryCountdown(retryAt: number) {
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

  return Math.max(0, Math.ceil((retryAt - now) / 1_000))
}
