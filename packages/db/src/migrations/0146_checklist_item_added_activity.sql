-- §V2-S03 — checklists, frames `02:15`–`02:55`.
--
-- The feed in the walkthrough reads "You added item task required to checklist
-- Checklist". Rundesk logged `checklist_item_toggled` when somebody ticked a
-- line and logged nothing at all when somebody added one, so a checklist could
-- gain ten items and the activity feed stayed silent about all of them.
--
-- `IF NOT EXISTS` because `drizzle-kit push` may already have added the value
-- from the TypeScript enum — the two paths have to agree rather than race.

ALTER TYPE activity_action ADD VALUE IF NOT EXISTS 'checklist_item_added';
