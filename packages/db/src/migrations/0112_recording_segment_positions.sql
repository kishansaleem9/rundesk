-- §2.8 — a recording segment's position is claimed, not guessed.
--
-- attachRecording read `max(position)` in one statement and inserted `max + 1`
-- in the next. Two segments finishing together both read the same maximum and
-- both wrote it, so "every piece of one call, in order" became two pieces
-- claiming to be the same one and `ORDER BY position` returned them in
-- whichever order the planner felt like. The service now computes the position
-- inside the insert; this index is what makes losing that race an error to
-- retry rather than a row to live with.
--
-- Existing ties are resolved first, oldest kept, or the index cannot be built
-- on a deployment that has already hit this.
WITH renumbered AS (
  SELECT id,
         row_number() OVER (PARTITION BY call_id ORDER BY position, created_at, id) - 1 AS seq
    FROM call_recordings
   WHERE call_id IN (
     SELECT call_id FROM call_recordings GROUP BY call_id, position HAVING count(*) > 1
   )
)
UPDATE call_recordings r
   SET position = renumbered.seq
  FROM renumbered
 WHERE r.id = renumbered.id
   AND r.position IS DISTINCT FROM renumbered.seq;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_call_recordings_position"
  ON "call_recordings" ("call_id", "position");
