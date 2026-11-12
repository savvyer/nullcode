#!/usr/bin/env bash
# nullcode upstream-sync helper: after `git merge upstream/master`, upstream edits to
# workflows/dependabot we deleted show up as modify/delete conflicts (DU) under .github/.
# Keep them deleted; list everything else that still needs a human/agent decision.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

removed=0
while IFS= read -r path; do
  case "$path" in
    .github/workflows/fork-*) echo "sync-cleanup: KEEP ours (fork workflow): $path"; git checkout --ours -- "$path"; git add -- "$path" ;;
    .github/workflows/*|.github/dependabot.yml) git rm -q --cached -- "$path" 2>/dev/null || true; rm -f -- "$path"; removed=$((removed + 1)); echo "sync-cleanup: removed upstream $path" ;;
  esac
done < <(git diff --name-only --diff-filter=U)

# New upstream workflows (added, not conflicting) also stay out of the fork.
while IFS= read -r path; do
  case "$path" in
    .github/workflows/fork-*) ;;
    .github/workflows/*|.github/dependabot.yml) git rm -q -f -- "$path"; removed=$((removed + 1)); echo "sync-cleanup: dropped new upstream $path" ;;
  esac
done < <(git diff --cached --name-only --diff-filter=A)

echo "sync-cleanup: $removed upstream .github file(s) kept out"
remaining=$(git diff --name-only --diff-filter=U)
if [ -n "$remaining" ]; then
  echo "sync-cleanup: conflicts left to resolve (check plugins/PATCHES.md for intent):"
  echo "$remaining" | sed 's/^/  /'
  exit 1
fi
