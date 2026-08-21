-- §2.2 — the notification kinds she named in the Primary customiser.
--
-- > "kisi ne mera hi task kisi aur ko de diya aur mujhe REMOVE kar diya to
-- >  mujhe woh cheez show ho … FOLLOWER CHANGE … Ab neeche se REACTIONS mujhe
-- >  na show hon, [shared with] mujhe na show ho; agar ACCESS REQUEST — agar
-- >  kisi ne koi access maanga to mujhe show ho."
--
-- The customiser can only offer types the API can emit, so five of the ten
-- kinds she went through were unofferable however good the picker was.
--
-- ADD VALUE only. Postgres 12+ allows this inside a transaction as long as the
-- new value is not *used* in the same transaction, which is why this migration
-- adds the labels and nothing else — the emitters ship as code.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'task_unassigned';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'task_follower_changed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'message_reaction';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'shared_with_me';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'access_requested';
