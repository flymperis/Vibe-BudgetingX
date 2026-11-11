import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { setUnauthorizedHandler } from '@/api/client'
import { markLoggedOut, registerCsrfLoader } from '@/auth/session'
import { ConfirmProvider } from '@/components/ConfirmProvider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { installSheetHistory } from '@/hooks/useBackToClose'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { createQueryClient } from './query-client'
import { createAppRouter } from './router'

function createApp() {
  const queryClient = createQueryClient()
  registerCsrfLoader(queryClient)
  // A 401 from any endpoint marks the session as logged out; <RequireAuth>
  // then redirects to /login?next=<current page>.
  setUnauthorizedHandler(() => markLoggedOut(queryClient))
  // Before the router: the back button closes sheets without the router noticing.
  installSheetHistory()
  return { queryClient, router: createAppRouter() }
}

// One instance per page load. Not useState(createApp): StrictMode runs that
// initializer twice in dev and keeps the first result, so the 401 handler and
// the CSRF loader registered by the second call would point at a discarded client.
let app: ReturnType<typeof createApp> | null = null
const getApp = () => (app ??= createApp())

export function App() {
  const { queryClient, router } = getApp()
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
