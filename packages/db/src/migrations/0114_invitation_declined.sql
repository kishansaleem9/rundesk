-- §G01 [00:18] — the recipient can say no.
--
-- `revoked` already existed and is not the same thing: that is the sender
-- cancelling an invitation they sent. Declining is the person invited turning
-- it down. Folding them together would leave an admin asking why somebody
-- never joined with no way to tell "I cancelled it" from "they said no".
--
-- Postgres cannot add an enum value inside a transaction that then uses it, and
-- IF NOT EXISTS makes this safe to re-run on a database that already has it.
ALTER TYPE "invitation_status" ADD VALUE IF NOT EXISTS 'declined';
