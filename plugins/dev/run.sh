#!/usr/bin/env bash
# Run a command inside the nullcode dev container. Source and pnpm store live in docker volumes,
# not on the host filesystem:
#   plugins/dev/run.sh pnpm install --frozen-lockfile --ignore-scripts
#   plugins/dev/run.sh node --import tsx/esm plugins/scripts/guard-telemetry.ts
# NULLCODE_SRC_VOLUME (default nullcode-src) holds a clone at /src/nullcode.
# Prefer --ignore-scripts; allowBuilds in pnpm-workspace.yaml governs scripts when you do run them.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
image="${NULLCODE_DEV_IMAGE:-nullcode-dev:local}"
docker image inspect "$image" >/dev/null 2>&1 || docker build -t "$image" "$here"
exec docker run --rm -i $( [ -t 0 ] && echo -t ) \
  -v "${NULLCODE_SRC_VOLUME:-nullcode-src}:/src" \
  -v "${NULLCODE_STORE_VOLUME:-nullcode-pnpm-store}:/pnpm-store" \
  -w /src/nullcode "$image" "$@"
