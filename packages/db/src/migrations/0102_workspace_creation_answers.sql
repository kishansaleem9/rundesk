-- §7 — keep what the create-workspace flow asks.
--
-- "Main 'New Workspace' par click karoongi … same layout jo aap ne abhi kiya
-- tha [signup ke waqt]" [08:43]. The flow was a single name field; making it
-- the stepped flow she describes means it now asks two more things, and the
-- frame pass specifically noted the equivalent answers being collected and
-- silently discarded. Asking and then discarding is worse than not asking.
--
-- Both nullable: `coming_from` is null when someone takes the skip she points
-- at, and a skip is an answer rather than an absence.
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "purpose" text;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "coming_from" text;
