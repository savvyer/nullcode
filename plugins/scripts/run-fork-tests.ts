/**
 * Unit tests of the packages nullcode patches, minus the upstream tests listed in plugins/test-divergence.json.
 *   node --import tsx/esm plugins/scripts/run-fork-tests.ts [extra vitest args]
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './lockfile.ts'

const list = JSON.parse(readFileSync(join(ROOT, 'plugins', 'test-divergence.json'), 'utf8')) as {
  paths: string[], excludeTests: { title: string }[]
}
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
const pattern = `^(?!.*(?:${list.excludeTests.map(test => escape(test.title)).join('|')}))`
const args = ['exec', 'vitest', 'run', ...list.paths,
  // Hosted runners are much slower than upstream's 16-core pools; a 5 s default times out filesystem-heavy specs.
  '--testNamePattern', pattern, '--testTimeout', '30000', ...process.argv.slice(2)]
console.log(`run-fork-tests: ${list.excludeTests.length} upstream tests skipped (plugins/test-divergence.json)`)
const result = spawnSync('pnpm', args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(result.status ?? 1)
