-- §V2-11 — what AI SAVED, not only what it cost.
--
-- Frames `19:00`/`19:05` put Time Saved and Human Cost Savings beside spend,
-- at an editable $/hour, with an explicit "Edit benchmark" control. Rundesk's
-- existing AI usage surface (`AiUsageTab`, §A4.4) answers "what did this cost";
-- the question a person renewing a subscription actually asks is what it was
-- worth.
--
-- TIME SAVED CANNOT BE MEASURED, ONLY ESTIMATED, and that is exactly why the
-- benchmark is stored rather than hard-coded. ClickUp says the same thing out
-- loud by putting "Edit benchmark" on the page. A constant buried in the code
-- would present one team's guess to every other team as a fact; a column the
-- workspace owns makes the figure theirs, arguable, and correctable.
--
-- The unit is an AI RUN — one row in `ai_usage`, one call to the model — and
-- not an "action", because that is what is actually counted. A user action can
-- be several runs, so calling runs "actions" would overstate the saving in a
-- way nobody could see. The surface shows the arithmetic for the same reason.

ALTER TABLE workspaces
  -- Minutes of human work one AI run is taken to replace. Six is deliberately
  -- modest: it is the low end of "reading a thread and writing a summary", and
  -- a default that flatters the product would make the whole panel untrustworthy.
  ADD COLUMN IF NOT EXISTS ai_minutes_saved_per_run integer NOT NULL DEFAULT 6,
  -- In CENTS, so the rate never rounds through a float on its way to a total.
  ADD COLUMN IF NOT EXISTS ai_hourly_rate_cents integer NOT NULL DEFAULT 5000;

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_ai_minutes_saved_sane
    CHECK (ai_minutes_saved_per_run >= 0 AND ai_minutes_saved_per_run <= 480),
  ADD CONSTRAINT workspaces_ai_hourly_rate_sane
    CHECK (ai_hourly_rate_cents >= 0 AND ai_hourly_rate_cents <= 10000000);
