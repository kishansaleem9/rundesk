-- §1.1 — a workspace with task types but no default is silently broken.
--
-- Deleting the default type left the workspace with none, and nothing
-- re-nominated one. Every task created afterwards came out untyped, and both
-- the create-modal picker and the search filter went back to hiding
-- themselves — the exact invisible-feature failure 0093 was written to fix.
--
-- Production reached that state during a deploy check, which created a default
-- type and then deleted it. The service now re-nominates on delete; this
-- repairs the workspaces already in that state.
--
-- Picks the first type in the workspace's own order, which is the one a person
-- would expect to be the default.

UPDATE task_types t
SET is_default = true
WHERE t.id = (
  SELECT inner_t.id
  FROM task_types inner_t
  WHERE inner_t.workspace_id = t.workspace_id
  ORDER BY inner_t.position, inner_t.created_at
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM task_types d
  WHERE d.workspace_id = t.workspace_id AND d.is_default
);
