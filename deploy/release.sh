#!/usr/bin/env bash
#
# Put a named commit on production, and then prove it arrived.
#
#   ./deploy/release.sh                                  # deploy main
#   ./deploy/release.sh claude/peaceful-mayer-zxpP7      # deploy a branch
#   ./deploy/release.sh v1.4.0                           # deploy a tag
#
# Why this exists rather than `deploy.sh rebuild` on its own:
#
#   1. `rebuild` runs a bare `git pull`, which deploys whatever branch the
#      server happens to be sitting on. That is fine when the server is on
#      main and you want main. It is wrong every other time, and it fails
#      silently in the worst way — the deploy "succeeds" and ships code
#      nobody meant to ship.
#
#   2. Verification was a separate command people had to remember. A deploy
#      that is not checked is a deploy that is assumed, and the whole reason
#      verify-release.sh exists is that this instance cannot be opened from
#      the office to look at it.
#
# Run from the repo root on the production host.
set -euo pipefail

cd "$(dirname "$0")/.."

REF="${1:-main}"

say() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ─────────────────────────────────────────────────────────── preflight ────
[ -f .env ] || die ".env missing at the repo root. Copy deploy/env.production.template to .env first."

# A dirty tree here means somebody edited files on the server. Checking out
# over that would destroy their work with no way back, so it stops instead —
# and says how to proceed deliberately.
if [ -n "$(git status --porcelain)" ]; then
  if [ "${FORCE:-0}" = "1" ]; then
    echo "⚠️  Working tree is dirty and FORCE=1 — those changes are about to be lost."
  else
    git status --short
    die "The working tree on this host has uncommitted changes (listed above).
   Commit or stash them, or re-run with FORCE=1 to discard them."
  fi
fi

say "Fetching $REF"
git fetch --prune origin "$REF" || die "Could not fetch '$REF' from origin."

# A branch resolves through origin/, a tag or a raw sha resolves as itself.
if git rev-parse --verify --quiet "origin/$REF" >/dev/null; then
  TARGET="origin/$REF"
else
  TARGET="$REF"
fi
SHA="$(git rev-parse --verify "$TARGET^{commit}")" || die "'$REF' is not a commit."

BEFORE="$(git rev-parse --short HEAD)"
say "Checking out ${SHA:0:8} ($REF)"
# Detached on purpose: the host is a deployment of one commit, not a place
# where branches are developed. SKIP_PULL below keeps rebuild from undoing it.
git checkout --quiet --detach "$SHA"

echo "  was $BEFORE, now $(git rev-parse --short HEAD)"
git --no-pager log -1 --format='  %h %s%n  %an, %ar'

# ──────────────────────────────────────────────────────────── the build ────
say "Building and restarting"
SKIP_PULL=1 ./deploy/deploy.sh rebuild

# ─────────────────────────────────────────────────────────── the proof ────
# Non-fatal on purpose. The code is already live at this point, so failing the
# script here would say "the deploy failed" when what actually happened is
# "the deploy landed and something about it is wrong" — and those need
# different reactions. The exit code still carries the verdict.
say "Verifying the running instance"
if bash deploy/verify-release.sh; then
  printf '\n\033[1;32m✓ %s is live and verified.\033[0m\n' "${SHA:0:8}"
else
  printf '\n\033[1;31m✗ %s is LIVE but verification reported failures above.\033[0m\n' "${SHA:0:8}"
  printf '   Roll back with:  ./deploy/release.sh %s\n' "$BEFORE"
  exit 1
fi
