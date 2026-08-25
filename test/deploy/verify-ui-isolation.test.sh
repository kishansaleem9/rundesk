#!/usr/bin/env bash
# One broken selector in deploy/verify-ui.mjs must not hide every check below it.
#
# On 21 Aug 2026 a run against the VPS printed "40 passed, 1 failed" and looked
# like a near-complete pass. It was not: a locator in §2.2b timed out, the throw
# escaped to the file's single try/catch, and §2.5, §1.3, §1.1, §2.9a and the
# health sweep never executed at all. Nothing said so. A partial run that reads
# as a complete one is worse than a failing one, because you act on it.
#
# Each section now runs inside its own guard. This holds that line without
# needing a browser or a deployment: verify-ui.mjs is run for real against a
# stub standing in for playwright, with one selector rigged to throw the way a
# timed-out click does, and we check that later sections still ran.
#
#   bash test/deploy/verify-ui-isolation.test.sh
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

passed=0
failed=0
check() {
  if [ "$1" = "ok" ]; then
    passed=$((passed + 1))
    printf '  PASS  %s\n' "$2"
  else
    failed=$((failed + 1))
    printf '  FAIL  %s%s\n' "$2" "${3:+ — $3}"
  fi
}

# A stand-in for playwright. Every locator answers "nothing here" — which makes
# most checks fail, and that is fine: this test is about control flow, not about
# whether the UI is good. Only the selector named in THROW_ON behaves specially.
mkdir -p "$WORK/pw/playwright"
cat > "$WORK/pw/playwright/package.json" <<'JSON'
{"name":"playwright","version":"0.0.0-stub","type":"module","main":"index.mjs"}
JSON
cat > "$WORK/pw/playwright/index.mjs" <<'JS'
const THROW_ON = process.env.THROW_ON ?? ''
const URL_ = '/app/52bd2140-4a60-4079-8799-1fd6965b8718'
const locator = (sel) => {
  const die = () => {
    if (THROW_ON && sel.includes(THROW_ON)) {
      throw new Error(`locator.click: Timeout 30000ms exceeded.\n  at ${sel}`)
    }
  }
  const self = {
    count: async () => (die(), sel.includes('input[type=email]') ? 1 : 0),
    innerText: async () => (die(), ''),
    allInnerTexts: async () => (die(), []),
    evaluateAll: async () => (die(), []),
    click: async () => die(),
    fill: async () => die(),
    isChecked: async () => (die(), false),
    boundingBox: async () => (die(), null),
    first: () => self, last: () => self, nth: () => self,
    filter: () => self, locator: (s) => locator(`${sel} ${s}`),
    getByRole: () => self, waitFor: async () => die(),
  }
  return self
}
let pendingRoute = null
const page = {
  url: () => URL_,
  goto: async () => {}, waitForTimeout: async () => {}, waitForURL: async () => {},
  fill: async () => {}, click: async () => {}, screenshot: async () => {},
  // Reproduces the 25 Aug crash deterministically rather than by timing: the
  // handler is captured at route() and invoked, unawaited, at unroute() — which
  // is exactly the ordering that broke, a handler completing against a route
  // Playwright has already released. Firing it on a timer instead looked like a
  // test and was not: process.exit() discards pending timers, so the handler
  // never ran and the assertion passed with the bug present.
  route: async (_pattern, handler) => { pendingRoute = handler },
  unroute: async () => {
    const handler = pendingRoute
    pendingRoute = null
    if (typeof handler !== 'function') return
    // AWAITED, not fire-and-forget. The stub's api helpers short-circuit to
    // resolved promises once the fake login fails, so everything after §2.9a is
    // microtasks — a setTimeout inside the handler would never get a turn and
    // the assertion would pass without the handler ever finishing. Awaiting it
    // here (verify-ui awaits unroute) guarantees it runs to completion.
    await handler({
      continue: async () => {
        console.error('STUB-VIOLATION: the handler continued a released route')
        throw new Error('Route is already handled!')
      },
    }).catch(() => {})
  },
  evaluate: async () => false,
  locator, getByRole: () => locator('role'), on: () => {},
  mouse: { click: async () => {} }, keyboard: { press: async () => {} },
}
export const chromium = {
  launch: async () => ({
    newContext: async () => ({ newPage: async () => page }),
    close: async () => {},
  }),
}
JS

# Port 9 (discard) is never listening, so the script's own API fetches fail fast
# and it falls back to reading the workspace id out of the stubbed URL.
run_with_throw() {
  PLAYWRIGHT_DIR="$WORK/pw" BASE=http://127.0.0.1:9 SHOT_DIR="$WORK" API_READY_MS=0 THROW_ON="$1" \
    node "$REPO/deploy/verify-ui.mjs" 2>&1 | sed 's/\x1b\[[0-9;]*m//g'
}

# CHUNK_HOLD_MS shortens §2.9a's deliberate 4s hold so the handler actually
# fires within a stub run — otherwise the process exits first and the assertion
# below passes without ever exercising the path.
run_route_handler() {
  PLAYWRIGHT_DIR="$WORK/pw" BASE=http://127.0.0.1:9 SHOT_DIR="$WORK" API_READY_MS=0 CHUNK_HOLD_MS=20 \
    node "$REPO/deploy/verify-ui.mjs" 2>&1 | sed 's/\x1b\[[0-9;]*m//g'
}

# A rejection from anywhere at all, to prove the process-level guard catches
# what no section guard can.
run_with_stray_rejection() {
  PLAYWRIGHT_DIR="$WORK/pw" BASE=http://127.0.0.1:9 SHOT_DIR="$WORK" API_READY_MS=0 \
    NODE_OPTIONS="--import=$WORK/stray.mjs" \
    node "$REPO/deploy/verify-ui.mjs" 2>&1 | sed 's/\x1b\[[0-9;]*m//g'
}

# Every section that must still be reached after an early one blows up. §2.2b is
# the one rigged to throw, so it is deliberately not in this list.
LATER_SECTIONS=('§2.5' '§1.3' '§1.1' '§2.9a' 'HEALTH')

echo "1. a section that throws is reported as a failure"
out="$(run_with_throw 'primary-customise')"
if grep -q 'FAIL \[§2.2b\] threw:' <<<"$out"; then
  check ok "the throw is attributed to the section it happened in"
else
  check no "the throw is attributed to the section it happened in" "no §2.2b failure line"
fi

echo
echo "2. and does not take the rest of the run with it"
for s in "${LATER_SECTIONS[@]}"; do
  if grep -qF "▶ $s" <<<"$out"; then
    check ok "$s still ran"
  else
    check no "$s still ran" "never reached — this is the 21 Aug regression"
  fi
done

echo
echo "3. the summary counts the whole file, not the part before the throw"
# Sanity: with a stub that answers "nothing here" to everything, the run must
# still produce many results. A handful would mean it stopped early again.
total="$(grep -cE '^  (PASS|FAIL) ' <<<"$out")"
if [ "$total" -ge 20 ]; then
  check ok "$total checks were reported"
else
  check no "enough checks were reported" "only $total — the run stopped early"
fi

echo
echo "4. the §2.9a route handler survives being unrouted while it sleeps"
# The 25 Aug crash: the handler continued a route Playwright had already
# released, and the rejection killed the process before §15 ran.
out="$(run_route_handler)"
if grep -q 'STUB-VIOLATION' <<<"$out"; then
  check no "the handler leaves a released route alone" "it still continues a released route"
else
  check ok "the handler leaves a released route alone"
fi
if grep -q 'HEALTH' <<<"$out"; then
  check ok "and the run reaches the end"
else
  check no "and the run reaches the end" "the process died — this is the 25 Aug regression"
fi

echo
echo "5. a stray rejection from anywhere is one failure, not the end of the run"
# The guard behind the fix: no section try/catch can catch a promise nobody
# awaits, so the process-level handler has to turn it into a FAIL.
cat > "$WORK/stray.mjs" <<'MJS'
setTimeout(() => { Promise.reject(new Error('something nobody awaited')) }, 40)
MJS
out="$(run_with_stray_rejection)"
if grep -q 'unhandled rejection: something nobody awaited' <<<"$out"; then
  check ok "the stray rejection is reported"
else
  check no "the stray rejection is reported" "it was swallowed instead"
fi
if grep -qE '^[0-9]+ passed, [0-9]+ failed' <<<"$out"; then
  check ok "and the run still prints a summary"
else
  check no "and the run still prints a summary" "no summary — a dead run looks like a stopped one"
fi

echo
echo "6. an unrigged run reaches the end too"
out2="$(run_with_throw '')"
if grep -qF '▶ HEALTH' <<<"$out2"; then
  check ok "HEALTH is reached with nothing rigged"
else
  check no "HEALTH is reached with nothing rigged" "the file aborts on its own"
fi

echo
printf '%d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
