import { defineConfig, devices } from '@playwright/test'

/**
 * One config for every e2e spec (money, manage, planning, shared, insights,
 * login smoke).
 *
 *   VBX_E2E_BASE=http://127.0.0.1:5002 npx playwright test   # an already running app
 *   npx playwright test                                       # starts its own Vite on :5174
 *
 * Without VBX_E2E_BASE, Vite proxies /api and /static to the backend at
 * VBX_API_TARGET (default http://127.0.0.1:5001, the dev backend), so a
 * backend must be running. The login smoke spec mocks the network itself.
 *
 * Each run writes into its own folder under test-results/ (parallel runs do
 * not clobber each other). Traces are off unless VBX_E2E_TRACE=1.
 */
const VITE_PORT = Number(process.env.VBX_E2E_PORT ?? 5174)
const BASE = process.env.VBX_E2E_BASE ?? `http://127.0.0.1:${VITE_PORT}`
// Set once in the main process; the workers inherit it, so one run = one folder.
process.env.VBX_E2E_RUN_ID ??= `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`
const RUN_ID = process.env.VBX_E2E_RUN_ID

export default defineConfig({
  testDir: './e2e',
  outputDir: `./test-results/${RUN_ID}`,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    trace: process.env.VBX_E2E_TRACE ? 'retain-on-failure' : 'off',
    locale: 'el-GR',
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: process.env.VBX_E2E_BASE
    ? undefined
    : {
        command: `npx vite --port ${VITE_PORT} --strictPort --host 127.0.0.1`,
        url: BASE,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
