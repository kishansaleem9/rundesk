-- §V2-S09 frame `08:32` — the Create Folder dialog's Settings → Statuses row,
-- whose value reads "Use Space statuses" and which carries a `›` to override.
--
-- One column, not a fourth status table. Folders store no statuses of their
-- own: this is the default `status_scope` handed to lists created inside the
-- folder, and `resolveEffectiveStatuses` already honours 'space' on both the
-- read path and the task write path. A folder holding a status set nothing
-- read would be the mirror defect.
--
-- Default 'space', because that is what the frame's dialog shows before
-- anybody touches it.
ALTER TABLE "folders"
  ADD COLUMN IF NOT EXISTS "status_scope" text NOT NULL DEFAULT 'space';
