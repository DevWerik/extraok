import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { authService } from '@/services/auth.service'

export function useSession() {
  return useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: ({ signal }) => authService.getSession({ signal }),
  })
}

export function useSignIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: authService.signIn,
    onSuccess: (session) => {
      queryClient.removeQueries()
      queryClient.setQueryData(queryKeys.auth.session, session)
    },
  })
}

export function useSignUp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: authService.signUp,
    onSuccess: (session) => {
      queryClient.removeQueries()
      queryClient.setQueryData(queryKeys.auth.session, session)
    },
  })
}

export function useSignOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: authService.signOut,
    onSuccess: () => {
      queryClient.clear()
      queryClient.setQueryData(queryKeys.auth.session, null)
    },
  })
}
