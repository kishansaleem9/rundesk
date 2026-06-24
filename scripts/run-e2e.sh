#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Rundesk — full-platform browser E2E runner.
#
# Drives a real Chromium browser against a running Rundesk instance and walks
# the actual UI: login, create space→project→list→task, open the task drawer,
# drag cards between board columns, use the docs editor (B7 controls), send
# chat, add personal/list items, search, and (optionally) member-permission
# gating. Self-cleaning: everything it creates via the API it deletes after.
#
# Run from the repo root on any machine with Node + internet (your laptop, or
# the VPS host). It installs the test runner + Chromium on first run.
#
#   ./scripts/run-e2e.sh
#   PW_BASE_URL=https://rundesk.theaura.agency \
#   E2E_EMAIL=test@yopmail.com E2E_PASSWORD=Test@123456 ./scripts/run-e2e.sh
#
# To also test member gating, add:
#   E2E_MEMBER_EMAIL=member1@yopmail.com E2E_MEMBER_PASSWORD=Test@123456
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
C_R=$'\033[31m'; C_G=$'\033[32m'; C_C=$'\033[36m'; C_B=$'\033[1m'; C_X=$'\033[0m'

command -v node >/dev/null 2>&1 || { printf "${C_R}Node is required to run the browser tests.${C_X}\n"; exit 1; }

export PW_BASE_URL="${PW_BASE_URL:-https://rundesk.theaura.agency}"
export E2E_EMAIL="${E2E_EMAIL:-${1:-test@yopmail.com}}"
export E2E_PASSWORD="${E2E_PASSWORD:-${2:-Test@123456}}"

printf "\n${C_C}${C_B}Rundesk E2E → %s  (login: %s)${C_X}\n" "$PW_BASE_URL" "$E2E_EMAIL"

# Ensure workspace deps (the test runner) are present.
if [ ! -d node_modules/@playwright ]; then
  printf "${C_C}Installing dependencies (first run)…${C_X}\n"
  if command -v pnpm >/dev/null 2>&1; then pnpm install || exit 1
  else corepack pnpm install || npm install || exit 1; fi
fi

# Ensure the Chromium browser binary is present.
printf "${C_C}Ensuring Chromium is installed…${C_X}\n"
npx playwright install chromium >/dev/null 2>&1 || npx playwright install --with-deps chromium || true

printf "${C_C}Running the suite…${C_X}\n\n"
npx playwright test "$@"
RC=$?

printf "\n${C_C}${C_B}HTML report:${C_X} npx playwright show-report e2e/.report\n"
exit $RC
