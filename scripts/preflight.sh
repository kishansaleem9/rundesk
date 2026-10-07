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
step "what a migration makes, the schema declares" node scripts/check-schema-declares-migrations.mjs
step "and the schema gate can fail too"  node scripts/check-schema-declares-migrations-cases.mjs --mutate
step "every workspace write is guarded" node scripts/check-workspace-guards.mjs
step "a workspace role list is stated once" node scripts/check-role-lists.mjs
step "and that gate can fail too"      node scripts/check-role-lists-cases.mjs --mutate
step "each lane script is read whole"   node scripts/check-lane-scripts-whole.mjs
step "and an edit mid-run is harmless"  node scripts/check-lane-scripts-whole-cases.mjs --mutate
step "every offered permission is asked" node scripts/check-permission-keys-asked.mjs
step "and that gate bites too"         node scripts/check-permission-keys-asked-cases.mjs --mutate
step "every ledger id cited is an item" node scripts/check-ledger-ids.mjs
step "and that gate bites as well"      node scripts/check-ledger-ids-cases.mjs --mutate
step "the sweep fixture builds where it picked" node scripts/check-sweep-fixture-cases.mjs --mutate
step "a drifted lane database is caught" bash scripts/e2e-lanes/schema-drift-selfcheck.sh
step "a push that stops is not read as synced" bash scripts/e2e-lanes/push-log-selfcheck.sh --mutate
step "one writer or many readers per lane bundle" bash scripts/e2e-lanes/bundle-lock-selfcheck.sh --mutate
step "a suite runs where its model need is met" bash scripts/e2e-lanes/lane-need-selfcheck.sh --mutate
step "what verify asks of a lane is read exactly" bash scripts/e2e-lanes/verify-guards-selfcheck.sh --mutate
step "each lane script works on its own tree" bash scripts/e2e-lanes/lane-root-selfcheck.sh --mutate
step "a stale stub is stopped before its replacement starts" bash scripts/e2e-lanes/stub-down-selfcheck.sh --mutate
step "a worktree builds its own packages" bash scripts/e2e-lanes/link-worktree-selfcheck.sh --mutate
step "a routing suite says what its worker does" node scripts/check-suite-routes.mjs
step "and that gate bites, case by case"  node scripts/check-suite-routes-cases.mjs --mutate
step "the e2e proxy keeps what it advertises" node scripts/check-local-stack-keepalive.mjs --mutate
step "two sweeps at once keep two records" bash scripts/e2e-lanes/sweep-selfcheck.sh
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
step "and leave the tree they found"     node scripts/check-tree-state-cases.mjs --mutate
step "and they read this tree, not a nested one" node scripts/check-find-in-tree.mjs --mutate
step "every suite has a break patch"    node scripts/check-break-coverage.mjs
step "every suite has a CI step"        node scripts/check-suites-registered.mjs
step "and that gate can fail"           node scripts/check-suites-registered-cases.mjs --mutate
step "a suite that makes a person hands them to the cleanup" node scripts/check-suite-made-registered.mjs
step "and that gate bites, case by case" node scripts/check-suite-made-registered-cases.mjs --mutate
step "no branch changes the run's length" node scripts/check-suite-check-branches.mjs
step "and that rule can fail at all"    node scripts/check-branches-cases.mjs --mutate
step "nothing ends a section on a throw" node scripts/check-suite-section-enders.mjs
step "and rule six's reader holds up"    node scripts/check-suite-reads.mjs --mutate
step "and every ender rule bites"        node scripts/check-suite-enders.mjs --mutate
step "a check of shown text reads what is drawn" node scripts/check-suite-text-reads.mjs --mutate
step "no silent catch on an API client" node scripts/check-suite-api-catches.mjs --mutate
step "and no suite hand-rolls one"      node scripts/check-suite-api-clients.mjs --mutate
step "and a status of 0 never reads as success" node scripts/check-suite-status-floor.mjs --mutate
step "no new process.exit in a suite"   node scripts/check-suite-process-exit.mjs --mutate
step "a refusal-standing suite declares it" node scripts/check-suite-lane-need.mjs --mutate
step "the S3 stub is faithful to the SDK" node scripts/check-s3-stub.mjs --mutate
step "a lane's old API stops before reuse" bash scripts/check-lane-api-down.sh --mutate
step "a failed planner is never 'nothing left'" bash scripts/check-build-plan.sh --mutate
step "and the round loop ends as it says"  bash scripts/check-rounds.sh --mutate
step "a dead holder's lock is taken, a live one kept" bash scripts/check-locks.sh --mutate
step "one suite's break sets never run at once" bash scripts/check-run-plan.sh --mutate
step "a break set that needs a model runs with one" bash scripts/check-model-lanes.sh --mutate
step "a lane number is one lane, never a count" bash scripts/check-lane-lists.sh --mutate
step "a new table proves a lane current too" bash scripts/check-schema-witness.sh --mutate
step "bail stops the file and loses nothing" node scripts/check-bail.mjs --mutate
step "and the model seam is really a seam" node scripts/check-model-stub.mjs --mutate
step "and the search seam is really a seam" node scripts/check-meili-stub.mjs --mutate
step "and the calendar seam is really a seam" node scripts/check-calendar-stub.mjs --mutate
step "the chain helper holds its contract" node scripts/check-chain-helper.mjs --mutate
step "a wait gives up at its deadline" node scripts/check-wait-helper.mjs --mutate
step "a mutant run ends with all it started" node scripts/check-run-mutant.mjs --mutate
step "a break patch runs aimed at its own tree" node scripts/check-patch-root.mjs --mutate
step "the claim matcher holds its contract" node scripts/check-claim-match.mjs --mutate
step "patch-to-suite attribution holds"  node scripts/check-suite-of-patch.mjs --mutate
step "log-to-tree provenance holds"      node scripts/check-log-tree.mjs --mutate
step "verify-ui isolation harness"      bash -c 'bash test/deploy/verify-ui-isolation.test.sh > /tmp/preflight-iso.log 2>&1'
echo
[ "$fail" = "0" ] && echo "PREFLIGHT CLEAN" || echo "PREFLIGHT FAILED — see /tmp/preflight-*.log"
exit $fail
