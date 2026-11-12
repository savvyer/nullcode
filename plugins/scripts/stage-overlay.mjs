// nullcode (PATCHES.md P2): `prepack` of apps/desktop-host copies the overlay beside lib/index.js,
// so the packed host (and the Desktop runtime built from it) always carries it.
import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../overlay/nullcode.patch.yml', import.meta.url))
const target = fileURLToPath(new URL('../../apps/desktop-host/lib/nullcode.patch.yml', import.meta.url))
mkdirSync(fileURLToPath(new URL('../../apps/desktop-host/lib/', import.meta.url)), { recursive: true })
copyFileSync(source, target)
console.log(`nullcode: staged overlay → ${target}`)
