#!/usr/bin/env bash
# Create the next nullcode release tag: v<upstream product version>-<YYYY.MM.DD>-<n>, e.g. v0.2.2-rc.2-2026.11.12-1.
# <n> counts releases of that version on that day (from the tags on origin). Uses only git, so it runs on the host.
#   plugins/scripts/release-tag.sh          # create the annotated tag on HEAD and print it
#   plugins/scripts/release-tag.sh --push   # also push it, which starts fork-desktop.yml's release
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

version=$(git show HEAD:apps/desktop/package.json | sed -n 's/^  "version": "\(.*\)",$/\1/p')
[ -n "$version" ] || { echo "release-tag: no version in apps/desktop/package.json" >&2; exit 1; }
day=$(date +%Y.%m.%d)
prefix="v$version-$day-"

git fetch -q --tags origin
last=$(git tag --list "$prefix*" | sed "s/^$(printf '%s' "$prefix" | sed 's/[.[\*^$]/\\&/g')//" | grep -E '^[0-9]+$' | sort -n | tail -1 || true)
tag="$prefix$(( ${last:-0} + 1 ))"

git tag -a "$tag" -m "nullcode $tag (upstream $version)"
echo "$tag"
if [ "${1:-}" = --push ]; then git push origin "refs/tags/$tag"; fi
