-- §V2-08 — merging one task into another, frame `15:32`.
--
-- Two new activity actions, not one. The surviving task's log has to say what
-- arrived and from where; the binned task's has to say where its work went.
-- With only the first, somebody who follows an old link finds an archived task
-- and no explanation of what happened to it.
--
-- `IF NOT EXISTS` because `drizzle-kit push` may already have added them from
-- the TypeScript enum — the two paths have to agree rather than race.

ALTER TYPE activity_action ADD VALUE IF NOT EXISTS 'merged_in';
ALTER TYPE activity_action ADD VALUE IF NOT EXISTS 'merged_away';
