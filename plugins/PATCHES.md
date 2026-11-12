# nullcode — patches to upstream files

Everything nullcode adds lives in `plugins/` (+ `.github/workflows/fork-*.yml`, `.claude/skills/upstream-sync/`).
This is the register of the few edits to **upstream** files. Each one is marked in code with `nullcode (PATCHES.md Pn)`,
so `git grep -n "PATCHES.md P"` lists them. On a sync conflict, re-apply the **intent**, not the old text.

| # | File(s) | Edit | Why / how to re-apply |
|---|---|---|---|
| P0 | `.github/workflows/*` (all upstream), `.github/dependabot.yml` | deleted | Upstream CI/release targets deepseek-ai infrastructure. `plugins/scripts/sync-cleanup.sh` keeps them out after each merge (DU conflicts and newly added files). |
| P1 | `apps/desktop-host/src/index.ts` | `patchFiles: [nullcodeOverlay()]` | Applies `plugins/overlay/nullcode.patch.yml` after bundles and user layers (fail-closed if the file is missing). The overlay is the single switch; `guard-telemetry.ts` verifies its effect. |
| P2 | `apps/desktop-host/package.json`: `files` += `lib/nullcode.patch.yml`, `scripts.prepack` = `node ../../plugins/scripts/stage-overlay.mjs` | ship the overlay inside the packed desktop-host | `pnpm --dir apps/desktop-host pack` (package-target.ts) runs `prepack`, which copies the overlay beside `lib/index.js`; the host resolves it via `import.meta.url`, source runs fall back to `plugins/overlay/`. `guard-telemetry.ts --packaged` checks the copy inside `app.asar`. |
| P3 | `packages/llm/llm-deepseek/src/adapter.ts` | removed `x-deepseek-harness-user-id` and `x-deepseek-harness-session-id` request headers | Persistent anonymous user id + session id were sent with every DeepSeek API call. Kept: `attributionHeaders()` (user-agent with version) and `x-deepseek-harness-compact`. `guard-telemetry.ts` fails if the headers come back. |
| P4 | `apps/desktop/scripts/electron-builder-config.mjs` (`policy`), `apps/desktop/scripts/desktop-package-environment.mjs` (`validateDesktopPackageEnvironment`) | unsigned ⇒ no mandatory-update policy on every OS | Upstream only skipped it for unsigned macOS; the policy calls `download.deepseek.com/api/v0/check_client_update`. |
| P5 | `apps/desktop/scripts/package-target.ts` (`main`) | `localMacOSPackageEnvironment()` for every unsigned target | Windows unsigned no longer needs a private `.env.windows`. The function keeps its upstream name (now: local unsigned defaults for any OS) to keep the diff small. |
| P6 | `desktop-package-environment.mjs` (`DSH_DESKTOP_APP_ID` → `dev.nullcode.app`), `electron-builder-config.mjs` (`productName`, `extraMetadata.productName`, `protocols`, `artifactName`, mic text), `apps/desktop/src/main.ts` (`nullcode://` scheme), `apps/desktop/scripts/smoke-packaged-runtime.ts` (packaged app/exe name) | rebrand of the package identity | New install beside DeepSeek Harness, own userData dir, own URL scheme. UI strings (`src/locale.ts`) and the signed-only paths in `package-target.ts`/`package-macos.ts` are intentionally untouched. |
| P7 | `electron-builder-config.mjs` (`update`) | unsigned Windows: generic feed `https://github.com/savvyer/nullcode/releases/latest/download`, channel `nightly`; macOS: no feed | `fork-desktop.yml` publishes the installer + blockmap + `nightly.yml` to the Release. Squirrel.Mac needs a signature, so macOS updates manually. |
| P8 | `apps/cli/package.json`, root `package.json`, `pnpm-lock.yaml` | removed `@deepseek-ai/dsh-cua-bundle` dependency | Computer use is not shipped. `OPTIONAL_BUNDLES` is untouched; the package stays in the workspace (deps reduction: `plugins/DEPS.md`). |
| P9 | `apps/desktop/src/welcome-api.ts` (`needsWelcome` → `false`), `apps/desktop/src/welcome-backend.ts` (inert signed-out account backend instead of `desktopAccountBackend`) | no DeepSeek sign-in welcome | The account rows are disabled by the overlay; the shell's account is inert at its one construction site (no account RPCs, no account WebSocket that would reconnect every second, sign-in rejects). The workspace opens directly; providers are set in Settings → Models. |
| P10 | `pnpm-workspace.yaml` | `minimumReleaseAge: 10080` | Newly resolved versions must be ≥ 7 days old. Upstream's `minimumReleaseAgeExclude` list stays as is. |
| P11 | `apps/desktop/scripts/smoke-runtime.ts` (smoke profile patch) | office-kit `timeoutMs: 110000` for the packaged-runtime smoke only | GitHub-hosted Macs (Intel and Rosetta) exceed the 60 s default on LibreOffice's cold first conversion; the shipped app keeps upstream's default. |

## Not patched on purpose
- `apps/desktop/src/main.ts` mandatory-update logic: skipped automatically when the manifest has no policy (P4).
- Platform view (`DesktopPlatformView`): stays constructed but is only opened from account UI, which the overlay removes.
- Browser-use providers: not mounted, not in `apps/cli` dependencies.
