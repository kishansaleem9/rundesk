#!/usr/bin/env bash
# Everything CI's "Verify Monorepo" job runs, in its order, before any push.
#
# Added after a push went red on LINT alone: typecheck and the unit tests had
# been run locally, lint had not, and two no-fallthrough errors from comments
# placed between `case` labels took the whole job down — with every later step
# skipped, so the run said nothing about anything else.
#
# IT HAPPENED AGAIN, AND THE SCRIPT WAS ALREADY HERE. A `react-hooks/
# rules-of-hooks` **error** — a `useEffect` below an early return, so the hook
# order changed between renders — shipped in `666f15f` and survived a whole
# afternoon. Typecheck was run constantly, this was not run once. It was found
# by an agent mentioning it in passing, and the failing unit test beside it the
# same way. A preflight nobody runs is not a preflight; run this before every
# commit, not before every push.
cd /home/user/rundesk
fail=0
step () {
  printf '\n=== %s\n' "$1"; shift
  "$@" && echo "    OK" || { echo "    FAILED"; fail=1; }
}
step "lint (turbo run lint)"            bash -c 'pnpm exec turbo run lint > /tmp/preflight-lint.log 2>&1'
step "typecheck (turbo run typecheck)"  bash -c 'pnpm exec turbo run typecheck > /tmp/preflight-tsc.log 2>&1'
step "api unit tests"                   bash -c 'cd apps/api && pnpm exec tsx --test $(find src -name "*.test.ts") > /tmp/preflight-api.log 2>&1'
step "web unit tests"                   bash -c 'cd apps/web && ../../packages/db/node_modules/.bin/tsx --test $(find src -name "*.test.ts" -o -name "*.test.tsx" | tr "\n" " ") > /tmp/preflight-web.log 2>&1'
step "migration guardrail"              node scripts/check-migration-order.mjs
step "no break patches in the tree"     node scripts/check-no-break-patches.mjs
step "and that guard actually looks"    node scripts/check-patch-guard.mjs --mutate
step "re-audit ledger adds up"          node scripts/check-video2-counts.mjs
step "every frame is answered somewhere" node scripts/check-frame-traceability.mjs
step "every break patch finds its line" python3 scripts/check-break-patches.py
step "break runs measured this tree"    node scripts/check-break-freshness.mjs
step "break patches name a real check"  node scripts/check-break-claims.mjs
step "and reddened the one they name"   node scripts/check-break-reddened.mjs
step "the plan asks for what is unmeasured" node scripts/check-plan-population.mjs
step "and the unit claims redden too"   node scripts/check-unit-claims.mjs
step "every suite has a break patch"    node scripts/check-break-coverage.mjs
step "no conditional check has no else" node scripts/check-suite-check-branches.mjs
step "nothing ends a section on a throw" node scripts/check-suite-section-enders.mjs
step "and rule six's reader holds up"    node scripts/check-suite-reads.mjs
step "and every ender rule bites"        node scripts/check-suite-enders.mjs --mutate
step "the S3 stub is faithful to the SDK" node scripts/check-s3-stub.mjs --mutate
step "and the model seam is really a seam" node scripts/check-model-stub.mjs --mutate
step "the chain helper holds its contract" node scripts/check-chain-helper.mjs
step "the claim matcher holds its contract" node scripts/check-claim-match.mjs
step "patch-to-suite attribution holds"  node scripts/check-suite-of-patch.mjs
step "log-to-tree provenance holds"      node scripts/check-log-tree.mjs --mutate
step "verify-ui isolation harness"      bash -c 'bash test/deploy/verify-ui-isolation.test.sh > /tmp/preflight-iso.log 2>&1'
echo
[ "$fail" = "0" ] && echo "PREFLIGHT CLEAN" || echo "PREFLIGHT FAILED — see /tmp/preflight-*.log"
exit $fail
