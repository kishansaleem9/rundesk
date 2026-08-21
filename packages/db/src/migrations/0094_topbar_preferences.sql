-- §1.5 — a member can put away parts of the top bar, and the notification bell
-- starts put away.
--
-- > "hum notification yahan le ke jaa rahe hain, to humein yahan bhi rakhne ki
-- >  zaroorat nahi hai — just access; ya phir humein rakhne ki zaroorat hai to
-- >  yeh option jo hai woh humare members ke paas hona chahiye … Lekin humare
-- >  paas NAV BAR ko set down karne ka option nahi hai."
--
-- Two requests in one breath: take the bell out by default ("[Default par]"),
-- and give members a way to decide for themselves. Stored as the set of hidden
-- controls rather than the visible ones, so a control added later shows up for
-- everybody instead of silently defaulting to off for every existing member.
--
-- The default applies to existing rows too, which is the intent — she asked for
-- the bell to be gone by default, not only for new accounts.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS topbar_hidden jsonb NOT NULL DEFAULT '["notifications"]'::jsonb;
