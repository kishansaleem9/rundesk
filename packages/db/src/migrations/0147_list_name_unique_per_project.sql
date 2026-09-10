-- §V2-S11 — "List name taken", frame `08:50`.
--
-- The frame shows two error toasts stacked bottom-left, both reading "List name
-- taken", as she tries twice to reuse a name. Rundesk had no such constraint:
-- `createList` inserted whatever it was given, so a project could hold three
-- lists called "Backlog" and the only way to tell them apart was their id.
--
-- CASE-INSENSITIVE, because "Backlog" and "backlog" are the same name to the
-- person reading the sidebar, and a constraint that let both through would be
-- enforcing a rule nobody means.
--
-- PARTIAL, on `is_archived = false`. A list in the bin must not reserve its
-- name forever — deleting "Backlog" and making a new one is an ordinary thing
-- to do, and `restoreTask`'s equivalent for lists can put the old one back into
-- a project that now has a live namesake. That collision is a restore-time
-- problem, not a reason to block every new list.
--
-- SCOPED TO THE PROJECT, which is the container the sidebar shows lists under.
-- Two projects may each have a "Backlog"; one project may not.

-- Existing duplicates first, or the index cannot be created at all. The oldest
-- keeps the name; the rest are suffixed, which is visible and reversible rather
-- than silently merged or deleted.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY project_id, lower(name)
      ORDER BY created_at, id
    ) AS rn
  FROM lists
  WHERE is_archived = false
)
UPDATE lists
SET name = lists.name || ' (' || ranked.rn || ')'
FROM ranked
WHERE lists.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lists_project_name_active
  ON lists (project_id, lower(name))
  WHERE is_archived = false;
