import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { queryClient } from '@/lib/query-client'

interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  useEffect(() => {
    function handleUnauthorized() {
      queryClient.clear()
      const currentPath = `${window.location.pathname}${window.location.search}`
      const target = currentPath.startsWith('/login')
        ? '/login'
        : `/login?from=${encodeURIComponent(currentPath)}`
      window.location.replace(target)
    }

    window.addEventListener('extraok:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('extraok:unauthorized', handleUnauthorized)
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  )
}
