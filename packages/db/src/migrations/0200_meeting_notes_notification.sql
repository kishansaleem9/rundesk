-- The AI Notetaker's notes of a meeting it joined are ready (`commit-log/log-39863ff-1`): ClickUp's
-- land in the Inbox once the meeting ends, and so do these.
--
-- ADD VALUE only, as 0108 did: Postgres allows it inside a transaction as long as the new value is
-- not used in the same transaction, so this migration adds the label and nothing else.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'meeting_notes_ready';
