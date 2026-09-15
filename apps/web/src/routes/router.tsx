import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/app-shell'
import { GuestRoute } from '@/routes/guest-route'
import { ProtectedRoute } from '@/routes/protected-route'
import { RouteError } from '@/routes/route-error'

export const router = createBrowserRouter([
  {
    path: '/',
    lazy: async () => {
      const { LandingPage } = await import('@/pages/landing-page')
      return { Component: LandingPage }
    },
    errorElement: <RouteError />,
  },
  {
    element: <GuestRoute />,
    errorElement: <RouteError />,
    children: [
      {
        path: '/login',
        lazy: async () => {
          const { LoginPage } = await import('@/pages/login-page')
          return { Component: LoginPage }
        },
      },
      {
        path: '/cadastro',
        lazy: async () => {
          const { SignupPage } = await import('@/pages/signup-page')
          return { Component: SignupPage }
        },
      },
    ],
  },
  {
    path: '/recuperar-senha',
    lazy: async () => {
      const { PasswordResetPage } = await import('@/pages/password-reset-page')
      return { Component: PasswordResetPage }
    },
    errorElement: <RouteError />,
  },
  {
    path: '/aprovar/:token',
    lazy: async () => {
      const { ApprovalPage } = await import('@/pages/approval-page')
      return { Component: ApprovalPage }
    },
    errorElement: <RouteError />,
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            path: '/meu-plano',
            lazy: async () => {
              const { BillingPage } = await import('@/pages/billing-page')
              return { Component: BillingPage }
            },
          },
          {
            path: '/dashboard',
            lazy: async () => {
              const { DashboardPage } = await import('@/pages/dashboard-page')
              return { Component: DashboardPage }
            },
          },
          {
            path: '/clientes',
            lazy: async () => {
              const { ClientsPage } = await import('@/pages/clients-page')
              return { Component: ClientsPage }
            },
          },
          {
            path: '/atendimentos',
            lazy: async () => {
              const { JobsPage } = await import('@/pages/jobs-page')
              return { Component: JobsPage }
            },
          },
          {
            path: '/atendimentos/novo',
            lazy: async () => {
              const { NewJobPage } = await import('@/pages/new-job-page')
              return { Component: NewJobPage }
            },
          },
          {
            path: '/atendimentos/:id',
            lazy: async () => {
              const { JobDetailsPage } = await import('@/pages/job-details-page')
              return { Component: JobDetailsPage }
            },
          },
        ],
      },
    ],
  },
  {
    path: '*',
    lazy: async () => {
      const { NotFoundPage } = await import('@/pages/not-found-page')
      return { Component: NotFoundPage }
    },
  },
])
