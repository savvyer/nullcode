# nullcode

A fork of [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (MIT) that keeps upstream's
history and merges `upstream/master` regularly. Differences:

- **No telemetry or phone-home** apart from the LLM provider you select: OTel, product analytics, feedback upload,
  session-log/plugin-inventory request extensions, DeepSeek account/Platform login and the npm registry probe are
  off (`overlay/nullcode.patch.yml`); no identity headers on DeepSeek API calls; no mandatory-update policy.
- **Own unsigned Desktop builds** for macOS arm64/x64 and Windows x64 from GitHub Actions → GitHub Releases.
  Windows auto-updates from the Releases; macOS updates manually.
- **Providers**: configure in Settings → Models, e.g. OpenCode Go (`OPENCODE_API_KEY`, via the built-in pi-ai
  catalog) or DeepSeek by API key.

## Layout
| Path | What |
|---|---|
| `overlay/nullcode.patch.yml` | Cordis overlay applied after all bundle/user layers (desktop always; web/CLI with `--patch`). |
| `PATCHES.md` | Register of every edit to upstream files (P0–P10). |
| `UPSTREAM.md` | Sync log (upstream SHA → date → result). |
| `DEPS.md`, `deps-allowlist.json` | Dependency report and frozen lockfile allowlist. |
| `test-divergence.json` | Upstream tests that assert behaviour nullcode changes on purpose. |
| `scripts/` | `guard-telemetry.ts`, `check-deps.ts`, `deps-report.ts`, `run-fork-tests.ts`, `sync-cleanup.sh`, `stage-overlay.mjs`. |
| `dev/` | Docker dev container (`run.sh`): installs, builds and tests never run on the host. |
| `../.github/workflows/fork-*.yml` | CI (guards, typecheck, tests) and Desktop packaging/release. |
| `../.claude/skills/upstream-sync/` | The upstream sync procedure. |

## Install (unsigned)
- macOS: open the `.dmg`, drag nullcode to Applications, then right-click → Open the first time
  (or `xattr -dr com.apple.quarantine /Applications/nullcode.app`).
- Windows: run the installer; SmartScreen → More info → Run anyway.

## Release
Push a tag `v*` (e.g. `v0.2.2-rc.2.1`) → `fork-desktop.yml` builds all targets and publishes the Release.
`workflow_dispatch` builds artifacts only.
