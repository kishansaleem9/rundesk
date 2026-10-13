-- THE VIEW TYPES CLICKUP HAS (`commit-log/log-68bc188-1`, `ledger-rows/row-777`).
--
-- Frame `07:10`'s "Default settings for views" names eleven. A list drew six;
-- it draws the other five now — Activity, Workload, Timeline, Mind Map and
-- Map — so a view saved on a list may be any of them.
ALTER TYPE "public"."view_type" ADD VALUE IF NOT EXISTS 'activity';
ALTER TYPE "public"."view_type" ADD VALUE IF NOT EXISTS 'workload';
ALTER TYPE "public"."view_type" ADD VALUE IF NOT EXISTS 'timeline';
ALTER TYPE "public"."view_type" ADD VALUE IF NOT EXISTS 'mindmap';
ALTER TYPE "public"."view_type" ADD VALUE IF NOT EXISTS 'map';
