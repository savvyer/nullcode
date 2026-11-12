// nullcode release tags are v<product version>-<YYYY.MM.DD>-<n> (plugins/scripts/release-tag.sh creates them);
// the version part must equal apps/desktop/package.json of the tagged sources.
//   node plugins/scripts/check-release-tag.mjs <tag>
import { readFileSync } from 'node:fs'

const tag = process.argv[2] ?? ''
const { version } = JSON.parse(readFileSync(new URL('../../apps/desktop/package.json', import.meta.url), 'utf8'))
const escaped = version.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
if (!new RegExp(`^v${escaped}-\\d{4}\\.(0[1-9]|1[0-2])\\.(0[1-9]|[12]\\d|3[01])-[1-9]\\d*$`, 'u').test(tag)) {
  console.error(`::error::release tag "${tag}" must be v${version}-<YYYY.MM.DD>-<n>; create it with plugins/scripts/release-tag.sh`)
  process.exit(1)
}
console.log(`release tag ${tag} matches v${version}-<YYYY.MM.DD>-<n>`)
