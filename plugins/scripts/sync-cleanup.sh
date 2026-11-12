#!/usr/bin/env bash
# nullcode upstream-sync helper: after `git merge upstream/master`, upstream workflows/dependabot we deleted come
# back as modify/delete conflicts (DU) or as newly added files. Keep them out; list what still needs a decision.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

removed=0
keep_out() {
  case "$1" in
    .github/workflows/fork-*) if [ "$2" = conflict ]; then git checkout --ours -- "$1"; git add -- "$1"; echo "sync-cleanup: kept ours $1"; fi ;;
    .github/workflows/*|.github/dependabot.yml) git rm -q -f --ignore-unmatch -- "$1"; removed=$((removed + 1)); echo "sync-cleanup: removed upstream $1" ;;
  esac
}
while IFS= read -r path; do keep_out "$path" conflict; done < <(git diff --name-only --diff-filter=U)
while IFS= read -r path; do keep_out "$path" added; done < <(git diff --cached --name-only --diff-filter=A)

echo "sync-cleanup: $removed upstream .github file(s) kept out"
remaining=$(git diff --name-only --diff-filter=U)
if [ -n "$remaining" ]; then
  echo "sync-cleanup: conflicts left to resolve (check plugins/PATCHES.md for intent):"
  echo "$remaining" | sed 's/^/  /'
  exit 1
fi
