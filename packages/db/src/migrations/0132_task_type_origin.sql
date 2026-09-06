-- §V2-04 — a task type can say what MADE the task.
--
-- `[03:26]` "MILESTONE, FORM RESPONSE, ya MEETING NOTE se task create hue" —
-- the type is how you see where a task came from. Rundesk already creates tasks
-- from form submissions and from meeting action items; neither stamped a type,
-- so the provenance sat in the data and appeared nowhere on screen.
--
-- `origin` is a marker, not a name, for the same reason `is_milestone` is one:
-- the vocabulary belongs to the workspace. A team that renames "Form Response"
-- to "Enquiry", or runs the product in Urdu, still gets its form tasks stamped.
-- Matching on the string would stop working the moment anyone touched it, and
-- would stop silently.
--
-- NULL for every type a person made.

ALTER TABLE task_types ADD COLUMN IF NOT EXISTS origin text;

-- Backfill the two provenance types into workspaces that predate this.
--
-- Unlike 0093, the guard cannot be "this workspace has no types at all" —
-- every workspace has Task and Milestone by now, so that test would add
-- nothing anywhere. It is per-origin instead: add the form type only where no
-- form type exists. Re-running is a no-op, and a workspace that already made
-- its own is left exactly as it is.
--
-- `position` is taken past whatever the workspace already uses rather than
-- assumed to be 2 and 3, so a workspace that has added types of its own does
-- not end up with two types fighting over the same slot.
INSERT INTO task_types (workspace_id, name, icon, is_default, is_milestone, origin, position)
SELECT
  w.id,
  t.name,
  t.icon,
  FALSE,
  FALSE,
  t.origin,
  COALESCE((SELECT MAX(existing.position) + 1 FROM task_types existing WHERE existing.workspace_id = w.id), 0) + t.slot
FROM workspaces w
CROSS JOIN (
  VALUES
    ('Form Response', '▤', 'form',    0),
    ('Meeting Note',  '✎', 'meeting', 1)
) AS t(name, icon, origin, slot)
WHERE NOT EXISTS (
  SELECT 1 FROM task_types existing
  WHERE existing.workspace_id = w.id AND existing.origin = t.origin
);
