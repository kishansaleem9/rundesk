# ClickUp Parity Checklist

This checklist is the release gate for the parity program.

- Source of truth: `config/parity-checklist.json`
- Validation test: `apps/api/src/parity/parity-checklist.test.ts`
- Program smoke script: `scripts/smoke-phase1.mjs`

## Acceptance Rules

- Every track has at least 4 concrete acceptance items.
- No duplicate track IDs or duplicate item IDs.
- Track IDs and item IDs are lowercase kebab-case.
- Each item maps to at least one API or UI implementation point.
- QA gate requires smoke, API tests, lint, typecheck, and migration-order checks.

## Execution Notes

- Feature flags are used for risky rollouts and partial surfaces.
- CI enforces automated checks before merge.
- Migrations must remain sequence-safe and collision-free.
