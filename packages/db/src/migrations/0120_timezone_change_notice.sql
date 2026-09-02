-- G06-6 [07:03] — ClickUp's "Notify me of Timezone changes", checked by default.
--
-- The paired half of this gap is validation, which needed no schema: the API
-- now refuses a timezone it cannot read, because `startOfDayIn` deliberately
-- falls back to UTC on an unrecognised zone and that silence is the bug —
-- somebody who typed "Asia/Karach" got UTC for every due date and digest with
-- nothing anywhere saying so.
--
-- This column is the other half: when the browser reports a different zone
-- from the stored one, say so and offer to update. Default true, matching her
-- frame, and cheap to turn off for anyone who travels and does not care.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone_change_notice boolean NOT NULL DEFAULT true;
