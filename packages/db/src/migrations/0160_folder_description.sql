-- §V2-S09 frame `08:25` — the Create Folder dialog's second field,
-- **Description**, placeholder *"Tell us a bit about your Folder (optional)"*,
-- sitting between Name and "Select a Location".
--
-- THE READER EXISTS BEFORE THE COLUMN DOES, which is the only reason this is
-- worth adding. `container-edit-dialog.tsx` is the shared dialog for spaces,
-- folders, projects and lists and it already has a description field behind a
-- `fields.description` flag — projects pass it today. So a description typed in
-- the create dialog is read back by reopening the folder, rather than stored
-- against a someday: the mirror defect this audit names second is a stored
-- value no reader honours, and a folder description with the flag left off
-- would have been exactly that.
--
-- Nullable with no default, matching `spaces.description` and
-- `projects.description`: an absent description and an empty one are the same
-- thing to every reader here, and the frame marks the field "(optional)".
ALTER TABLE "folders"
  ADD COLUMN IF NOT EXISTS "description" text;
