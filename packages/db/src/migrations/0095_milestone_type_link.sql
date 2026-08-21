-- §1.1 — one milestone, not two.
--
-- > "30 days mein se 22-23 days humare working days hain. Ab in 23 days ke liye
-- >  hum is ko 'task' ka naam nahi de sakte — woh MILESTONE hai."
--
-- tasks.is_milestone has always drawn the diamond on the timeline, the badge in
-- lists and subtask rows, and the marker in the client portal. Task types
-- arrived later with a "Milestone" among them and no relationship to it, so
-- setting the type drew nothing and drawing the diamond left the task invisible
-- to a search filtered by the Milestone type.
--
-- task_types.is_milestone is the link. The type becomes the thing you set;
-- tasks.is_milestone stays what every surface renders from, and the service
-- keeps them in step.

ALTER TABLE task_types
  ADD COLUMN IF NOT EXISTS is_milestone boolean NOT NULL DEFAULT false;

-- The seeded Milestone type is one.
UPDATE task_types SET is_milestone = true WHERE lower(name) = 'milestone';

-- Every workspace that has milestone tasks but no milestone type gets one, so
-- the backfill below has somewhere to point.
INSERT INTO task_types (workspace_id, name, icon, is_default, is_milestone, position)
SELECT DISTINCT s.workspace_id, 'Milestone', '◆', false, true,
       (SELECT coalesce(max(position), -1) + 1 FROM task_types t WHERE t.workspace_id = s.workspace_id)
FROM tasks
JOIN lists    l ON l.id = tasks.list_id
JOIN projects p ON p.id = l.project_id
JOIN spaces   s ON s.id = p.space_id
WHERE tasks.is_milestone
  AND NOT EXISTS (
    SELECT 1 FROM task_types t WHERE t.workspace_id = s.workspace_id AND t.is_milestone
  );

-- Existing milestone tasks take the type, so the filter finds what the app
-- already shows. Only where the task has no type yet: a task someone
-- deliberately typed as something else keeps that type.
UPDATE tasks
SET task_type_id = t.id
FROM lists l, projects p, spaces s, task_types t
WHERE tasks.list_id = l.id
  AND l.project_id = p.id
  AND p.space_id = s.id
  AND t.workspace_id = s.workspace_id
  AND t.is_milestone
  AND tasks.is_milestone
  AND tasks.task_type_id IS NULL;

-- …and the reverse: a task already carrying a milestone type renders as one.
UPDATE tasks
SET is_milestone = true
FROM task_types t
WHERE tasks.task_type_id = t.id
  AND t.is_milestone
  AND NOT tasks.is_milestone;
