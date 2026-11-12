/** Test helper: render inside a fresh QueryClient and a memory router. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { MotionProvider } from '@/components/motion'

export function renderWithProviders(
  ui: ReactElement,
  { path = '/', routes = [] as RouteObject[] }: { path?: string; routes?: RouteObject[] } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createMemoryRouter([{ path: '*', element: ui }, ...routes], { initialEntries: [path] })
  return {
    queryClient,
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MotionProvider>
          <RouterProvider router={router} />
        </MotionProvider>
      </QueryClientProvider>,
    ),
  }
}
