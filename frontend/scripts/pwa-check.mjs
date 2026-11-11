#!/usr/bin/env node
/**
 * PWA checks on the BUILT and SERVED app (counterpart of the old
 * tests/test_pwa_manifest.py, run by `npm test` after Vitest):
 *
 *  1. test_manifest_served_without_login: GET /manifest.webmanifest without a
 *     session -> 200, Content-Type application/manifest+json.
 *  2. test_manifest_is_valid_standalone_manifest_with_icons_on_disk: JSON with
 *     display "standalone", name "Vibe Budgeting", a non-empty icons list, every
 *     icon present in the build and served as an image.
 *  3. test_login_page_links_manifest_and_apple_touch_icon: the served index.html
 *     (the login screen is the SPA) links manifest.webmanifest and
 *     apple-touch-icon.png, which is served too.
 *
 * The SPA is built into a temporary folder (dist/ is left alone) and served by
 * the real backend (backend/.venv python, or VBX_PYTHON) with a throwaway
 * database, exactly as in production. Skip with VBX_SKIP_PWA_CHECK=1.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.env.VBX_SKIP_PWA_CHECK === '1') {
  console.log('pwa-check: skipped (VBX_SKIP_PWA_CHECK=1)')
  process.exit(0)
}

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backend = resolve(frontend, '../backend')
const python =
  process.env.VBX_PYTHON ??
  [join(backend, '.venv/Scripts/python.exe'), join(backend, '.venv/bin/python')].find((p) => existsSync(p))
if (!python) {
  console.error('pwa-check: no backend virtualenv (backend/.venv); set VBX_PYTHON')
  process.exit(1)
}

const work = mkdtempSync(join(tmpdir(), 'vbx-pwa-'))
const dist = join(work, 'dist')
let server
const failures = []
const check = (ok, what) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}`)
  if (!ok) failures.push(what)
}

function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => res(port))
    })
    srv.on('error', rej)
  })
}

async function waitFor(url, ms = 30_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`backend did not answer ${url}`)
}

try {
  console.log('pwa-check: building the SPA…')
  const build = spawnSync(
    process.execPath,
    [
      join(frontend, 'node_modules/vite/bin/vite.js'),
      'build',
      '--outDir',
      dist,
      '--emptyOutDir',
      '--logLevel',
      'error',
    ],
    {
      cwd: frontend,
      stdio: 'inherit',
    },
  )
  if (build.status !== 0) throw new Error('vite build failed')

  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  server = spawn(
    python,
    ['-m', 'uvicorn', 'vbx.api.main:app', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: backend,
      env: {
        ...process.env,
        VBX_STATIC_DIR: dist,
        DATABASE_PATH: join(work, 'database.db'),
        VBX_ENABLE_JOBS: 'false',
        FLASK_SECRET_KEY: 'pwa-check-only',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  )
  let stderr = ''
  server.stderr.on('data', (d) => (stderr += d))
  await waitFor(`${base}/api/auth/session`).catch((e) => {
    console.error(stderr)
    throw e
  })
  console.log(`pwa-check: served by the backend on ${base}`)

  // 1. manifest without login, right type
  const res = await fetch(`${base}/manifest.webmanifest`)
  check(res.status === 200, 'manifest is served without login (200)')
  check(
    (res.headers.get('content-type') ?? '').split(';')[0].trim() === 'application/manifest+json',
    `manifest Content-Type is application/manifest+json (got ${res.headers.get('content-type')})`,
  )

  // 2. manifest content and icons
  const manifest = await res.json()
  check(manifest.display === 'standalone', 'manifest display is "standalone"')
  check(manifest.name === 'Vibe Budgeting', 'manifest name is "Vibe Budgeting"')
  check(
    typeof manifest.short_name === 'string' && manifest.short_name.length > 0,
    'manifest has a short_name',
  )
  check(manifest.start_url === '/', 'manifest start_url is "/"')
  check(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest has icons')
  for (const icon of manifest.icons ?? []) {
    check(existsSync(join(dist, icon.src.replace(/^\//, ''))), `icon ${icon.src} exists in the build`)
    const r = await fetch(`${base}${icon.src}`)
    check(
      r.status === 200 && r.headers.get('content-type') === 'image/png',
      `icon ${icon.src} is served as image/png`,
    )
  }
  check(
    (manifest.icons ?? []).some((i) => i.sizes === '512x512') &&
      (manifest.icons ?? []).some((i) => i.sizes === '192x192'),
    'icons include 192x192 and 512x512',
  )

  // 3. index.html (also what any client-side route answers) links manifest + apple touch icon
  for (const path of ['/', '/login']) {
    const html = await (await fetch(`${base}${path}`)).text()
    check(
      /<link[^>]+rel="manifest"[^>]+href="\/manifest\.webmanifest"/.test(html),
      `${path} links rel="manifest"`,
    )
    const apple = /<link[^>]+rel="apple-touch-icon"[^>]+href="([^"]+)"/.exec(html)
    check(!!apple && apple[1].endsWith('apple-touch-icon.png'), `${path} links rel="apple-touch-icon"`)
    if (apple) {
      const r = await fetch(`${base}${apple[1]}`)
      check(r.status === 200 && r.headers.get('content-type') === 'image/png', `${apple[1]} is served`)
    }
  }
  const built = readFileSync(join(dist, 'index.html'), 'utf8')
  check(built.includes('viewport-fit=cover'), 'index.html uses viewport-fit=cover (safe areas)')
} catch (e) {
  failures.push(String(e))
  console.error(`pwa-check: ${e}`)
} finally {
  server?.kill()
  await new Promise((r) => setTimeout(r, 300))
  try {
    rmSync(work, { recursive: true, force: true })
  } catch {
    /* the database file may still be locked on Windows for a moment */
  }
}

if (failures.length) {
  console.error(`pwa-check: ${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('pwa-check: all PWA checks passed')
