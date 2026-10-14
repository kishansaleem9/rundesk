-- THE TAGS 0001'S `task_labels` HOLDS, MOVED, AND THE TABLE DROPPED (`found-30-sep/task-labels-left-in-production`).
--
-- 0001 made `task_labels`, a task's tag by its name and colour. The schema replaced it with `labels`, the
-- workspace's tags, and `task_label_assignments`, which task carries which; no migration moved its rows or
-- dropped it, and nothing has read it since. A migrated database kept it, a pushed one never had it.
--
-- What it holds is moved as the imports move a tool's tags (`TreeWriter.label`): each name a tag of its
-- task's workspace — the one there already by that name, whatever its case — and the task carries it. Then
-- the table goes. On a database without it, a pushed one, nothing is done.
DO $$
BEGIN
  IF to_regclass('public.task_labels') IS NOT NULL THEN
    CREATE TEMP TABLE task_labels_moving ON COMMIT DROP AS
      SELECT tl.task_id, s.workspace_id, left(btrim(tl.name), 60) AS name, coalesce(nullif(btrim(tl.color), ''), '#8b5cf6') AS color
        FROM task_labels tl
        JOIN tasks t ON t.id = tl.task_id
        JOIN lists l ON l.id = t.list_id
        JOIN projects p ON p.id = l.project_id
        JOIN spaces s ON s.id = p.space_id
       WHERE btrim(tl.name) <> '';
    INSERT INTO labels (workspace_id, name, color)
      SELECT DISTINCT ON (m.workspace_id, lower(m.name)) m.workspace_id, m.name, m.color
        FROM task_labels_moving m
       WHERE NOT EXISTS (SELECT 1 FROM labels x WHERE x.workspace_id = m.workspace_id AND lower(x.name) = lower(m.name))
       ORDER BY m.workspace_id, lower(m.name), m.name
      ON CONFLICT DO NOTHING;
    INSERT INTO task_label_assignments (task_id, label_id)
      SELECT DISTINCT m.task_id, x.id
        FROM task_labels_moving m
        JOIN LATERAL (
          SELECT id FROM labels
           WHERE workspace_id = m.workspace_id AND lower(name) = lower(m.name)
           ORDER BY (name = m.name) DESC, created_at
           LIMIT 1
        ) x ON true
      ON CONFLICT DO NOTHING;
  END IF;
END $$;
DROP TABLE IF EXISTS "task_labels";
