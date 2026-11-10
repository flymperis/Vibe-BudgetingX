import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { RouterProvider } from 'react-router'
import { setUnauthorizedHandler } from '@/api/client'
import { markLoggedOut, registerCsrfLoader } from '@/auth/session'
import { ConfirmProvider } from '@/components/ConfirmProvider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { createQueryClient } from './query-client'
import { createAppRouter } from './router'

function createApp() {
  const queryClient = createQueryClient()
  registerCsrfLoader(queryClient)
  // A 401 from any endpoint marks the session as logged out; <RequireAuth>
  // then redirects to /login?next=<current page>.
  setUnauthorizedHandler(() => markLoggedOut(queryClient))
  return { queryClient, router: createAppRouter() }
}

export function App() {
  const [{ queryClient, router }] = useState(createApp)
  const isDesktop = useIsDesktop()
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
        <Toaster
          position={isDesktop ? 'bottom-right' : 'top-center'}
          offset={isDesktop ? 24 : { top: 'calc(env(safe-area-inset-top) + 12px)' }}
          mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
          duration={2500}
        />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
