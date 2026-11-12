/**
 * nullcode telemetry guard — checks the COMPOSED result, not source strings
 * (upstream files legitimately contain telemetry hosts).
 *
 *   node --import tsx/esm plugins/scripts/guard-telemetry.ts                 # composition + source checks (CI)
 *   node --import tsx/esm plugins/scripts/guard-telemetry.ts --packaged <dir> # a packaged Desktop artifacts dir only
 *
 * 1. `dsh --profile web --patch plugins/overlay/nullcode.patch.yml --dump-config` in a throwaway DSH_HOME:
 *    every overlay row exists in the composition (else upstream renamed an id) and carries the overlay's values;
 *    no other enabled row has telemetry|analytics|otel|feedback in its id or name.
 * 2. llm-deepseek's adapter sends no x-deepseek-harness-user-id / -session-id header.
 * 3. --packaged: no dshMandatoryUpdatePolicy, productName nullcode, the overlay shipped inside the desktop-host,
 *    and app-update.yml (if any) points only at github.com/savvyer/nullcode.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { isJsExpr, loadCordisYaml } from '../../scripts/cordis-yaml.ts'
import { ROOT } from './lockfile.ts'

const OVERLAY = join(ROOT, 'plugins', 'overlay', 'nullcode.patch.yml')
const SUSPICIOUS = /telemetry|analytics|otel|feedback/iu
// Independent of electron-builder-config.mjs on purpose: the guard asserts the feed, it does not derive it.
const UPDATE_FEED = 'https://github.com/savvyer/nullcode/'

type Row = { id?: string, name?: string, disabled?: unknown, config?: Record<string, unknown>, [key: string]: unknown }
const failures: string[] = []

/** Every row with an id, at any depth (inserts, presets), without descending into configs. */
function rows(value: unknown, out: Row[] = []): Row[] {
  if (Array.isArray(value)) for (const item of value) rows(item, out)
  else if (value !== null && typeof value === 'object' && !isJsExpr(value)) {
    const row = value as Row
    if (typeof row.id === 'string') out.push(row)
    for (const [key, child] of Object.entries(row)) if (key !== 'config') rows(child, out)
  }
  return out
}

function checkComposition(): void {
  const home = mkdtempSync(join(tmpdir(), 'nullcode-guard-'))
  let dump: string
  try {
    dump = execFileSync(process.execPath, ['--import', 'tsx/esm', join(ROOT, 'apps/cli/src/bin.ts'),
      '--profile', 'web', '--patch', OVERLAY, '--dump-config'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '' }, maxBuffer: 64 << 20,
    })
  } finally { rmSync(home, { recursive: true, force: true }) }
  const composed = rows(loadCordisYaml(dump))
  const byId = new Map<string, Row[]>()
  for (const row of composed) {
    const list = byId.get(row.id!)
    if (list === undefined) byId.set(row.id!, [row])
    else list.push(row)
  }
  const overlay = rows(loadCordisYaml(readFileSync(OVERLAY, 'utf8')))
  const owned = new Set<string>()
  for (const patch of overlay) {
    owned.add(patch.id!)
    const targets = byId.get(patch.id!)
    if (targets === undefined) { failures.push(`overlay row "${patch.id}" no longer exists upstream (renamed or removed?)`); continue }
    for (const target of targets) {
      if (patch.disabled === true && target.disabled !== true) failures.push(`row "${patch.id}" is not disabled in the composition`)
      for (const [key, value] of Object.entries(patch.config ?? {})) {
        if (!isDeepStrictEqual(target.config?.[key], value)) failures.push(`row "${patch.id}" config.${key} is ${JSON.stringify(target.config?.[key])}, expected ${JSON.stringify(value)}`)
      }
    }
  }
  // `!!js` disabled expressions are opaque: anything that is not literally `true` counts as possibly enabled.
  for (const row of composed) {
    if (row.disabled === true || owned.has(row.id!)) continue
    if (SUSPICIOUS.test(row.id!) || SUSPICIOUS.test(row.name ?? '')) {
      failures.push(`enabled row "${row.id}" (${row.name ?? 'no name'}) looks like telemetry/feedback — review and add it to the overlay`)
    }
  }
  console.log(`guard-telemetry: composition ${composed.length} rows, overlay ${owned.size} rows checked`)
}

function checkSources(): void {
  const adapter = readFileSync(join(ROOT, 'packages/llm/llm-deepseek/src/adapter.ts'), 'utf8')
  for (const header of ['x-deepseek-harness-user-id', 'x-deepseek-harness-session-id']) {
    if (adapter.includes(header)) failures.push(`llm-deepseek adapter sends ${header} again (PATCHES.md P3)`)
  }
}

interface AsarEntry { files?: Record<string, AsarEntry>, offset?: string, size?: number, unpacked?: boolean, link?: string }

/** Minimal asar reader (Chromium pickle header + JSON index) using positioned reads, so archives stay on disk. */
function readAsar(archive: string): { files: Map<string, AsarEntry>, read(path: string): Buffer } {
  const fd = openSync(archive, 'r')
  const chunk = (position: number, length: number): Buffer => {
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, position)
    return buffer
  }
  const prefix = chunk(0, 16)
  const headerSize = prefix.readUInt32LE(4)
  const root = JSON.parse(chunk(16, prefix.readUInt32LE(12)).toString('utf8')) as AsarEntry
  const files = new Map<string, AsarEntry>()
  const walk = (entry: AsarEntry, at: string): void => {
    for (const [name, child] of Object.entries(entry.files ?? {})) {
      const path = at === '' ? name : `${at}/${name}`
      if (child.files !== undefined) walk(child, path)
      else files.set(path, child)
    }
  }
  walk(root, '')
  return {
    files,
    read(path) {
      const entry = files.get(path)
      if (entry === undefined || entry.link !== undefined) throw new Error(`${archive}: ${path} not found`)
      if (entry.unpacked === true) return readFileSync(join(`${archive}.unpacked`, path))
      return chunk(8 + headerSize + Number(entry.offset), entry.size ?? 0)
    },
  }
}

/** app.asar archives and app-update.yml feeds under an artifacts directory (bundles are searched, node_modules are not). */
function packagedFiles(dir: string, found = { asars: [] as string[], feeds: [] as string[] }): typeof found {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.name === 'app.asar') found.asars.push(path)
    else if (entry.name === 'app-update.yml') found.feeds.push(path)
    else if (entry.isDirectory() && !entry.name.endsWith('.asar.unpacked') && entry.name !== 'node_modules') packagedFiles(path, found)
  }
  return found
}

function checkPackaged(dir: string): void {
  const { asars, feeds } = packagedFiles(dir)
  if (asars.length === 0) failures.push(`--packaged ${dir}: no app.asar found`)
  const overlay = readFileSync(OVERLAY)
  for (const archive of asars) {
    const asar = readAsar(archive)
    const manifest = JSON.parse(asar.read('package.json').toString('utf8')) as Record<string, unknown>
    if ('dshMandatoryUpdatePolicy' in manifest) failures.push(`${archive}: packaged manifest carries dshMandatoryUpdatePolicy`)
    if (manifest.productName !== 'nullcode') failures.push(`${archive}: productName is ${String(manifest.productName)}`)
    // The host the shell starts: <dsh>/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js (host-process.ts).
    const shipped = [...asar.files].filter(([path, entry]) => path.endsWith('dsh-desktop-host/lib/nullcode.patch.yml') && entry.link === undefined)
    if (shipped.length === 0) failures.push(`${archive}: desktop-host ships no lib/nullcode.patch.yml (PATCHES.md P2)`)
    for (const [path] of shipped) if (!asar.read(path).equals(overlay)) failures.push(`${archive}: ${path} differs from plugins/overlay/nullcode.patch.yml`)
  }
  for (const feed of feeds) {
    const urls = readFileSync(feed, 'utf8').match(/https?:\/\/\S+/gu) ?? []
    if (urls.length === 0 || urls.some(url => !url.startsWith(UPDATE_FEED))) failures.push(`${feed}: update feed outside ${UPDATE_FEED}: ${urls.join(', ')}`)
  }
  console.log(`guard-telemetry: packaged ${asars.length} app.asar checked`)
}

const packaged = process.argv.indexOf('--packaged')
if (packaged === -1) {
  checkComposition()
  checkSources()
} else {
  const dir = process.argv[packaged + 1]
  if (dir === undefined || !existsSync(dir)) failures.push('--packaged needs an existing directory')
  else checkPackaged(dir)
}
if (failures.length > 0) {
  for (const message of failures) console.error(`guard-telemetry: FAIL ${message}`)
  process.exit(1)
}
console.log('guard-telemetry: OK')
