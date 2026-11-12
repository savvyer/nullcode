/**
 * nullcode telemetry guard — checks the COMPOSED result, not source strings
 * (upstream files legitimately contain telemetry hosts).
 *
 *   node --import tsx/esm plugins/scripts/guard-telemetry.ts                 # composition + source checks
 *   node --import tsx/esm plugins/scripts/guard-telemetry.ts --packaged <dir> # + a packaged Desktop resources dir
 *
 * 1. `dsh --profile web --patch plugins/overlay/nullcode.patch.yml --dump-config` in a throwaway DSH_HOME:
 *    every overlay row exists in the composition (else upstream renamed an id) and carries the overlay's values;
 *    no other enabled row has telemetry|analytics|otel|feedback in its id.
 * 2. llm-deepseek's adapter sends no x-deepseek-harness-user-id / -session-id header.
 * 3. --packaged: no dshMandatoryUpdatePolicy in the packaged manifest; app-update.yml (if any) points only at
 *    github.com/savvyer/nullcode.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import yaml from 'js-yaml'

const ROOT = resolve(import.meta.dirname, '..', '..')
const OVERLAY = join(ROOT, 'plugins', 'overlay', 'nullcode.patch.yml')
const SUSPICIOUS = /telemetry|analytics|otel|feedback/iu
const UPDATE_FEED = 'https://github.com/savvyer/nullcode/'

// `!!js` expressions are opaque here: anything that is not literally `true` counts as possibly enabled.
const JS = new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (data: string) => ({ js: data }) })
const SCHEMA = yaml.DEFAULT_SCHEMA.extend([JS])

type Row = { id?: string, name?: string, disabled?: unknown, config?: Record<string, unknown>, [key: string]: unknown }
const failures: string[] = []
const fail = (message: string): void => { failures.push(message) }

function rows(value: unknown, out: Row[] = []): Row[] {
  if (Array.isArray(value)) for (const item of value) rows(item, out)
  else if (value !== null && typeof value === 'object') {
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
  const composed = rows(yaml.load(dump, { schema: SCHEMA }))
  const byId = new Map<string, Row[]>()
  for (const row of composed) byId.set(row.id!, [...byId.get(row.id!) ?? [], row])
  const overlay = yaml.load(readFileSync(OVERLAY, 'utf8'), { schema: SCHEMA }) as Row[]
  const owned = new Set<string>()
  for (const patch of overlay) {
    if (typeof patch.id !== 'string') { fail(`overlay: entry without id: ${JSON.stringify(patch)}`); continue }
    owned.add(patch.id)
    const targets = byId.get(patch.id)
    if (targets === undefined) { fail(`overlay row "${patch.id}" no longer exists upstream (renamed or removed?)`); continue }
    for (const target of targets) {
      if (patch.disabled === true && target.disabled !== true) fail(`row "${patch.id}" is not disabled in the composition`)
      for (const [key, value] of Object.entries(patch.config ?? {})) {
        if (!isDeepStrictEqual(target.config?.[key], value)) fail(`row "${patch.id}" config.${key} is ${JSON.stringify(target.config?.[key])}, expected ${JSON.stringify(value)}`)
      }
    }
  }
  for (const row of composed) {
    if (row.disabled === true || owned.has(row.id!)) continue
    if (SUSPICIOUS.test(row.id!) || SUSPICIOUS.test(row.name ?? '')) {
      fail(`enabled row "${row.id}" (${row.name ?? 'no name'}) looks like telemetry/feedback — review and add it to the overlay`)
    }
  }
  console.log(`guard-telemetry: composition ${composed.length} rows, overlay ${owned.size} rows checked`)
}

function checkSources(): void {
  const adapter = readFileSync(join(ROOT, 'packages/llm/llm-deepseek/src/adapter.ts'), 'utf8')
  for (const header of ['x-deepseek-harness-user-id', 'x-deepseek-harness-session-id']) {
    if (adapter.includes(header)) fail(`llm-deepseek adapter sends ${header} again (PATCHES.md P3)`)
  }
}

function find(dir: string, name: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (entry === name) out.push(path)
    else if (statSync(path).isDirectory() && !entry.endsWith('.asar.unpacked') && entry !== 'node_modules') find(path, name, out)
  }
  return out
}

interface AsarEntry { files?: Record<string, AsarEntry>, offset?: string, size?: number, unpacked?: boolean, link?: string }

/** Minimal asar reader (Chromium pickle header + JSON index), no dependency. */
function openAsar(archive: string): { files: Map<string, AsarEntry>, read(path: string): Buffer } {
  const data = readFileSync(archive)
  const headerSize = data.readUInt32LE(4)
  const jsonLength = data.readUInt32LE(12)
  const root = JSON.parse(data.subarray(16, 16 + jsonLength).toString('utf8')) as AsarEntry
  const files = new Map<string, AsarEntry>()
  const walk = (entry: AsarEntry, prefix: string): void => {
    for (const [name, child] of Object.entries(entry.files ?? {})) {
      const path = prefix === '' ? name : `${prefix}/${name}`
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
      const start = 8 + headerSize + Number(entry.offset)
      return data.subarray(start, start + (entry.size ?? 0))
    },
  }
}

function checkPackaged(dir: string): void {
  const asars = find(dir, 'app.asar')
  if (asars.length === 0) fail(`--packaged ${dir}: no app.asar found`)
  const overlay = readFileSync(OVERLAY)
  for (const archive of asars) {
    const asar = openAsar(archive)
    const manifest = JSON.parse(asar.read('package.json').toString('utf8')) as Record<string, unknown>
    if ('dshMandatoryUpdatePolicy' in manifest) fail(`${archive}: packaged manifest carries dshMandatoryUpdatePolicy`)
    if (manifest.productName !== 'nullcode') fail(`${archive}: productName is ${String(manifest.productName)}`)
    // The host the shell starts: <dsh>/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js (host-process.ts).
    const shipped = [...asar.files].filter(([path, entry]) => path.endsWith('dsh-desktop-host/lib/nullcode.patch.yml') && entry.link === undefined)
    if (shipped.length === 0) fail(`${archive}: desktop-host ships no lib/nullcode.patch.yml (PATCHES.md P2)`)
    for (const [path] of shipped) if (!asar.read(path).equals(overlay)) fail(`${archive}: ${path} differs from plugins/overlay/nullcode.patch.yml`)
  }
  for (const feed of find(dir, 'app-update.yml')) {
    const text = readFileSync(feed, 'utf8')
    const urls = text.match(/https?:\/\/\S+/gu) ?? []
    if (urls.length === 0 || urls.some(url => !url.startsWith(UPDATE_FEED))) fail(`${feed}: update feed outside ${UPDATE_FEED}: ${urls.join(', ')}`)
  }
  console.log(`guard-telemetry: packaged ${asars.length} app.asar checked`)
}

checkComposition()
checkSources()
const packaged = process.argv.indexOf('--packaged')
if (packaged !== -1) {
  const dir = process.argv[packaged + 1]
  if (dir === undefined || !existsSync(dir)) fail('--packaged needs an existing directory')
  else checkPackaged(dir)
}
if (failures.length > 0) {
  for (const message of failures) console.error(`guard-telemetry: FAIL ${message}`)
  process.exit(1)
}
console.log('guard-telemetry: OK')
