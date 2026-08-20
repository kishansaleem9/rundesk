-- §1.1 — every workspace gets Task and Milestone to begin with.
--
-- Task types shipped with an API and an empty table: nothing ever created a
-- default set, so every workspace had zero types. The picker added to the
-- create modal hides itself when a workspace has none, which meant the feature
-- was invisible on a real deployment — the deploy verification caught it as
-- "the workspace has no task types, so the picker is hidden".
--
-- Milestone is the one she asked for by name: "30 days mein se 22-23 days
-- humare working days hain. Ab in 23 days ke liye hum is ko 'task' ka naam
-- nahi de sakte — woh MILESTONE hai."
--
-- Backfill only. Workspaces that already defined their own types are left
-- exactly as they are, and re-running adds nothing: the guard is on the
-- workspace having no rows at all, not on the names.

INSERT INTO task_types (workspace_id, name, icon, is_default, position)
SELECT w.id, t.name, t.icon, t.is_default, t.position
FROM workspaces w
CROSS JOIN (
  VALUES
    ('Task',      '✓', TRUE,  0),
    ('Milestone', '◆', FALSE, 1)
) AS t(name, icon, is_default, position)
WHERE NOT EXISTS (
  SELECT 1 FROM task_types existing WHERE existing.workspace_id = w.id
);
