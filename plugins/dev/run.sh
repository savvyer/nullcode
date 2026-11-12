#!/usr/bin/env bash
# Run a command in the nullcode dev container. The git checkout is bind-mounted at /work, so
# node_modules and build output written by the container land in the checkout (git-ignored), while
# nothing from npm ever executes on the host. The pnpm store lives in a docker volume.
#   plugins/dev/run.sh pnpm install --frozen-lockfile --ignore-scripts
#   plugins/dev/run.sh node --import tsx/esm plugins/scripts/guard-telemetry.ts
#   plugins/dev/run.sh                       # interactive shell
# Prefer --ignore-scripts; allowBuilds in pnpm-workspace.yaml governs scripts when you do run them.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(git -C "$here" rev-parse --show-toplevel)"
image="${NULLCODE_DEV_IMAGE:-nullcode-dev:local}"
# Rebuild when the Dockerfile changes: the image tag carries its content hash.
tag="$image-$(git -C "$here" hash-object "$here/Dockerfile" | cut -c1-12)"
docker image inspect "$tag" >/dev/null 2>&1 || docker build -q -t "$tag" "$here" >/dev/null
tty=()
[ -t 0 ] && [ -t 1 ] && tty=(-t)
[ $# -eq 0 ] && set -- bash
exec docker run --rm -i ${tty[@]+"${tty[@]}"} \
  -v "$repo:/work" \
  -v "${NULLCODE_STORE_VOLUME:-nullcode-pnpm-store}:/pnpm-store" \
  -w /work "$tag" "$@"
