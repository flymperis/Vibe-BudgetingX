// Counterpart of the old tests/test_pwa_manifest.py
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../..')

describe('PWA', () => {
  it('manifest is a standalone manifest whose icons exist', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'))
    expect(manifest.display).toBe('standalone')
    expect(manifest.name).toBe('Vibe Budgeting')
    expect(manifest.icons.length).toBeGreaterThan(0)
    for (const icon of manifest.icons)
      expect(existsSync(resolve(root, 'public', icon.src.slice(1)))).toBe(true)
  })

  it('index.html links the manifest and apple touch icon, with viewport-fit=cover', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8')
    expect(html).toContain('rel="manifest"')
    expect(html).toContain('manifest.webmanifest')
    expect(html).toContain('rel="apple-touch-icon"')
    expect(html).toContain('apple-touch-icon.png')
    expect(html).toContain('viewport-fit=cover')
  })
})
