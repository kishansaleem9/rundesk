# Integration Branch Workflow

This repository uses an integration-branch model for parallel parity tracks.

## Branches

- `main`: protected release branch.
- `integration/parity`: convergence branch for all parity tracks.
- `track/*`: short-lived feature branches per track.

## Required Merge Gates (into `integration/parity`)

- CI workflow `CI` is green:
  - lint
  - typecheck
  - API tests
  - migration sequence check
- No unresolved migration conflicts in `packages/db/src/migrations`.
- Feature flags added for risky user-visible behavior.

## Merge Order

1. DB/schema changes first.
2. API contract and server behavior changes.
3. UI integration and interactions.
4. Smoke verification.

## Migration Sequencing Guardrails

- Migration filenames must match `NNNN_name.sql`.
- Sequence must be contiguous with no gaps (checked by `scripts/check-migration-order.mjs`).
- Avoid rewriting previous migration files; append only.

## Release Candidate Criteria

- `scripts/smoke-phase1.mjs` passes in staging.
- Critical parity checklist items are implemented and tested.
- No mock-only behavior remains in parity-critical routes.
