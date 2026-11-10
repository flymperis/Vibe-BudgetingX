import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { getLang } from './i18n'
import { initTheme } from './theme/theme'
import './index.css'

async function start() {
  // Dev only, opt-in: `npm run dev:mock` answers /api/auth/* and /api/bootstrap
  // with fixtures so screens can be built before the backend runs.
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK_API === '1') {
    const { installMockApi } = await import('./dev/mock-api')
    installMockApi()
  }
  initTheme()
  document.documentElement.lang = getLang()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
