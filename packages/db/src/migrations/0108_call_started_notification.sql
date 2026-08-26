-- §2.8 gap 9 — a call nobody is told about is a call nobody joins.
--
-- > "aap ko notification aa raha hoga ke CALL ka option aaya… aap chaho to
-- >  wahan se direct call join ho jaoge"  [19:25-19:57]
--
-- The notification_type enum listed twenty kinds and not one of them was a
-- call, so starting a SyncUp was visible only to whoever happened to be looking
-- at that channel at that moment.
--
-- ADD VALUE only. Postgres 12+ allows this inside a transaction as long as the
-- new value is not *used* in the same transaction, which is why this migration
-- adds the label and nothing else — the emitter ships as code.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'call_started';
