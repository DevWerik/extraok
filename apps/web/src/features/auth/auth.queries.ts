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

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: authService.requestPasswordReset, retry: false, gcTime: 0 })
}

export function useVerifyPasswordReset() {
  return useMutation({ mutationFn: authService.verifyPasswordReset, retry: false, gcTime: 0 })
}

export function useConfirmPasswordReset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: authService.confirmPasswordReset,
    retry: false,
    gcTime: 0,
    onSuccess: async () => {
      await queryClient.cancelQueries()
      queryClient.clear()
      queryClient.setQueryData(queryKeys.auth.session, null)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.auth.session,
        exact: true,
        refetchType: 'none',
      })
    },
  })
}
