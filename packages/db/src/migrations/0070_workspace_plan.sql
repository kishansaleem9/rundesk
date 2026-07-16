-- Commercial plan tier + optional per-workspace limit overrides (Plan §14.1).
-- Additive + idempotent — safe to re-run.
--
-- CRITICAL: the default is 'enterprise' so every EXISTING workspace (the internal
-- tool) keeps unlimited members/projects and every feature. Plan gating is opt-in
-- SaaS scaffolding and must never restrict current behavior — an enterprise
-- workspace passes every feature gate and limit check as a no-op.
--
-- `plan_limits` optionally overrides the tier's numeric limits / feature flags for
-- a negotiated deal; NULL = use the code-defined tier defaults
-- (apps/api/src/modules/plans/plans.constants.ts).
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "plan" text NOT NULL DEFAULT 'enterprise';
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "plan_limits" jsonb;
