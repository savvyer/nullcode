/** Shared pnpm-lock.yaml (v9) reader for the nullcode dependency scripts. */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import yaml from 'js-yaml'

/** Absolute repository root (two levels above plugins/scripts). */
export const ROOT = resolve(import.meta.dirname, '..', '..')
/** Frozen package@version allowlist that check-deps.ts compares the lockfile against. */
export const ALLOWLIST = join(ROOT, 'plugins', 'deps-allowlist.json')

type Deps = Record<string, string | { specifier: string, version: string }>
interface Importer { dependencies?: Deps, devDependencies?: Deps, optionalDependencies?: Deps }
interface Snapshot { dependencies?: Record<string, string>, optionalDependencies?: Record<string, string> }
/** The pnpm-lock.yaml sections these scripts read; absent sections are empty objects. */
export interface Lockfile {
  importers: Record<string, Importer>
  packages: Record<string, unknown>
  snapshots: Record<string, Snapshot>
}

/**
 * Parse a v9 pnpm lockfile.
 * @param path - lockfile path, the repository's pnpm-lock.yaml by default.
 * @returns importers, packages and snapshots, each defaulting to an empty object.
 */
export function readLockfile(path = join(ROOT, 'pnpm-lock.yaml')): Lockfile {
  const lock = yaml.load(readFileSync(path, 'utf8')) as Partial<Lockfile>
  return { importers: lock.importers ?? {}, packages: lock.packages ?? {}, snapshots: lock.snapshots ?? {} }
}

/** `@scope/name@1.2.3(peer@x)` → `@scope/name@1.2.3`. */
const packageKey = (snapshotKey: string): string => snapshotKey.replace(/\(.*$/u, '')
/**
 * @param key - `name@version` package key, scoped names included.
 * @returns the package name without its version.
 */
export const packageName = (key: string): string => key.slice(0, key.lastIndexOf('@'))

/**
 * @param lock - parsed lockfile.
 * @returns every external `name@version` in the packages section, sorted, peer suffixes removed.
 */
export const externalPackages = (lock: Lockfile): string[] => Object.keys(lock.packages).map(packageKey).sort()

const version = (value: string | { version: string }): string => typeof value === 'string' ? value : value.version
const external = (value: string): boolean => !value.startsWith('link:') && !value.startsWith('file:') && !value.startsWith('workspace:')

/** One external dependency declared by a workspace importer (`kind` names the manifest field). */
export interface DirectDependency { importer: string, name: string, version: string, kind: 'runtime' | 'dev' | 'optional' }

/**
 * @param lock - parsed lockfile.
 * @returns external dependencies declared directly by workspace importers; link:/file:/workspace: entries are skipped.
 */
export function directDependencies(lock: Lockfile): DirectDependency[] {
  const out: DirectDependency[] = []
  for (const [importer, deps] of Object.entries(lock.importers)) {
    for (const [kind, field] of [['runtime', 'dependencies'], ['dev', 'devDependencies'], ['optional', 'optionalDependencies']] as const) {
      for (const [name, value] of Object.entries(deps[field] ?? {})) {
        const resolved = version(value)
        if (external(resolved)) out.push({ importer, name, version: packageKey(resolved), kind })
      }
    }
  }
  return out
}

/**
 * @param lock - parsed lockfile.
 * @returns reverse edges from `name@version` to its dependents: packages, and importers as `workspace:<path>`.
 */
export function dependents(lock: Lockfile): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>()
  const add = (child: string, parent: string): void => {
    let set = reverse.get(child)
    if (set === undefined) reverse.set(child, set = new Set())
    set.add(parent)
  }
  for (const [key, snapshot] of Object.entries(lock.snapshots)) {
    for (const deps of [snapshot.dependencies, snapshot.optionalDependencies]) {
      for (const [name, value] of Object.entries(deps ?? {})) if (external(value)) add(`${name}@${packageKey(value)}`, packageKey(key))
    }
  }
  for (const dep of directDependencies(lock)) add(`${dep.name}@${dep.version}`, `workspace:${dep.importer}`)
  return reverse
}

/**
 * @param reverse - edges from {@link dependents}.
 * @param key - `name@version` to explain.
 * @returns one shortest path from a `workspace:<path>` importer down to `key`, or `[key]` when none exists.
 */
export function chain(reverse: Map<string, Set<string>>, key: string): string[] {
  const queue: string[][] = [[key]]
  const seen = new Set([key])
  while (queue.length > 0) {
    const path = queue.shift()!
    const head = path[0]!
    if (head.startsWith('workspace:')) return path
    for (const parent of reverse.get(head) ?? []) {
      if (seen.has(parent)) continue
      seen.add(parent)
      queue.push([parent, ...path])
    }
  }
  return [key]
}
