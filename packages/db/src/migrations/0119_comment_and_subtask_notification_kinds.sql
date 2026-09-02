-- G10-10 [12:21–12:24] / G10-11 [12:38–12:41] — three notification kinds.
--
-- > "kisi ne mujhe comment/assign kiya to mujhe show ho"
--
-- The two comment kinds already fired; they wore someone else's type.
-- assignComment wrote `task_assigned` and notifyCommentResolved wrote
-- `task_commented`, so in the Inbox an assigned comment was indistinguishable
-- from a task assignment, and in the Primary customiser the two could never be
-- toggled apart. That separation is the point: a resolved comment is routine,
-- an assigned one is somebody asking you to act.
--
-- `subtask_created` is new, and goes to the parent task's watchers and
-- assignees — people who are already on the task a subtask appears under.
--
-- Her list also names "Task created". It is deliberately absent: that fires to
-- people following a List, and there is no list-follow concept here to deliver
-- it to. A label with no emitter behind it is worse than an honest gap.
--
-- ADD VALUE only. Postgres 12+ allows this inside a transaction as long as the
-- new value is not *used* in the same transaction, which is why this migration
-- adds the labels and nothing else — the emitters ship as code.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'comment_assigned';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'comment_resolved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subtask_created';
