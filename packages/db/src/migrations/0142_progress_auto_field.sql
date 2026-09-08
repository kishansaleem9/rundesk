-- §V2-01b — "Progress (Auto)", the custom field she actually demonstrates.
--
-- `[00:24]` she creates a field called **Progress**, and frame `00:25` shows
-- its configuration in full: *Track completion of* → Subtasks · Checklists ·
-- Assigned comments, and *Tasks without active items* → "Display 100% when
-- task is in a done status".
--
-- Rundesk had all three inputs already — `tasks.parent_task_id` for subtasks,
-- `task_checklist_items.is_done`, and `task_comments.assigned_to_user_id` with
-- `resolved_at` — and no field that read any of them.
--
-- NOTHING IS STORED IN `custom_field_values` FOR THIS TYPE, deliberately. The
-- value is computed on read, because a percentage written down is correct for
-- exactly as long as nobody ticks a checklist item. The service refuses writes
-- to it rather than accepting one and quietly ignoring it.
--
-- Additive enum value, following 0058: ADD VALUE IF NOT EXISTS is idempotent,
-- and the value is not used in this transaction.
ALTER TYPE "custom_field_type" ADD VALUE IF NOT EXISTS 'progress_auto';

-- Per-definition settings that are not a dropdown's option list.
--
-- A SEPARATE COLUMN RATHER THAN `options`, which is typed as an ARRAY of
-- {label,value,color} and is read as one by every existing call site. Putting
-- an object in it would either break those readers or force each of them to
-- learn which types store which shape there.
ALTER TABLE custom_field_definitions
  ADD COLUMN IF NOT EXISTS config jsonb;

COMMENT ON COLUMN custom_field_definitions.config IS
  'Type-specific settings. progress_auto: { sources: { subtasks, checklists, assignedComments }, doneStatusIs100 }';
