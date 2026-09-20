-- Give every list that has no statuses the default pipeline.
--
-- `ListsService.create` seeds it. Three other paths that insert into `lists`
-- did not: a workspace's starter list, a list created by applying a project
-- template, and a list created by the ClickUp import. Those lists were
-- permanently status-less, and `resolveStatusForList` answered
-- `{ category: 'open' }` for ANY key on a list with none — so a task there
-- could be set to `done`, store `status = 'done'`, and keep
-- `status_category = 'open'`. The UI showed the status the person chose;
-- lists, reports, the planner, Workload and the teams work preview all reason
-- on the category. Work completed in those lists never counted as completed.
--
-- The creation paths are fixed in the same change. This is for the rows that
-- already exist, including in the seeded database CI runs against.

INSERT INTO list_statuses (list_id, key, name, color, category, position)
-- `list_statuses.category` is plain text, not an enum — no cast.
SELECT l.id, v.key, v.name, v.color, v.category, v.position
FROM lists l
CROSS JOIN (VALUES
  ('backlog',     'Backlog',     '#94a3b8', 'open',        0),
  ('todo',        'To do',       '#64748b', 'open',        1),
  ('in_progress', 'In progress', '#3b82f6', 'in_progress', 2),
  ('in_review',   'In review',   '#a855f7', 'in_progress', 3),
  ('done',        'Done',        '#10b981', 'closed',      4),
  ('cancelled',   'Cancelled',   '#f43f5e', 'closed',      5)
) AS v(key, name, color, category, position)
WHERE NOT EXISTS (SELECT 1 FROM list_statuses s WHERE s.list_id = l.id)
ON CONFLICT DO NOTHING;

-- Now repair the tasks those lists were holding.
--
-- A task whose stored `status` key resolves to a closed status on its own list
-- but whose `status_category` still says open is exactly the disagreement
-- above. Re-derive the category from the list's own pipeline rather than from
-- a hard-coded key list, so a list with renamed statuses is repaired by what
-- IT calls closed.

UPDATE tasks t
SET status_category = s.category
FROM list_statuses s
WHERE s.list_id = t.list_id
  AND s.key = t.status
  AND t.status_category IS DISTINCT FROM s.category;
