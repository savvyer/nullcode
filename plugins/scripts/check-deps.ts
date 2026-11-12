/**
 * nullcode dependency gate: every package@version in pnpm-lock.yaml must be in plugins/deps-allowlist.json.
 *
 *   node --import tsx/esm plugins/scripts/check-deps.ts            # fail on anything new, with "who pulls it"
 *   node --import tsx/esm plugins/scripts/check-deps.ts --write    # re-freeze the allowlist (after review!)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { ALLOWLIST, chain, dependents, externalPackages, readLockfile } from './lockfile.ts'

const lock = readLockfile()
const current = externalPackages(lock)

if (process.argv.includes('--write')) {
  writeFileSync(ALLOWLIST, `${JSON.stringify({
    comment: 'Frozen pnpm-lock.yaml package set. Additions need review (plugins/scripts/check-deps.ts --write); see plugins/DEPS.md.',
    packages: current,
  }, null, 2)}\n`)
  console.log(`check-deps: wrote ${current.length} packages to the allowlist`)
  process.exit(0)
}

const allowed = new Set((JSON.parse(readFileSync(ALLOWLIST, 'utf8')) as { packages: string[] }).packages)
const added = current.filter(key => !allowed.has(key))
const present = new Set(current)
const removed = [...allowed].filter(key => !present.has(key))
if (removed.length > 0) console.log(`check-deps: ${removed.length} allowlisted packages are gone (run --write to shrink the list)`)
if (added.length === 0) {
  console.log(`check-deps: OK, ${current.length} packages, all allowlisted`)
  process.exit(0)
}
const reverse = dependents(lock)
for (const key of added) console.error(`check-deps: NEW ${key}\n    via ${chain(reverse, key).join(' -> ')}`)
console.error(`check-deps: ${added.length} package(s) not in plugins/deps-allowlist.json — review, then run with --write`)
process.exit(1)
