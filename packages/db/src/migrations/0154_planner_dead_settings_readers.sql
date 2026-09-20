-- §V2-02e — the five planner settings that were stored and read by nothing.
--
-- Frame `14:10`'s Appearance page ends in an "Others" group of five switches.
-- `PlannerSettings` declared all five, the controller accepted them, the
-- service wrote them, Postgres kept them — and NOTHING ANYWHERE READ THEM:
--
--   show_week_numbers            0 references outside the schema
--   always_open_at_start_of_week 0
--   darken_non_working_hours     0
--   save_personal_events_quickly 0
--   show_recurring               0
--
-- against six working siblings in the same object, which is why nobody saw it.
-- The fix is in the readers (`workspace-planner-page.tsx`,
-- `workspace-meetings-page.tsx`), not here.
--
-- NO DDL IS REQUIRED, AND THAT IS WORTH SAYING OUT LOUD. These settings live
-- in the existing `users.planner_settings` jsonb, which is exactly why five of
-- them could be declared and forgotten without a migration ever being written:
-- a jsonb blob accepts a new key silently, so nothing in the schema history
-- records that they were added. There is no column to create and no constraint
-- that would have caught this.
--
-- What this migration does instead is MATERIALISE the defaults, so that
-- `GET /planner/:workspaceId/settings` answers with the keys rather than with
-- their absence. Three consequences, all small and all wanted:
--
--   · the settings dialog draws each switch from a stored value instead of
--     from a default inferred client-side, so two clients that disagreed about
--     a default could not disagree about a person's calendar;
--   · the row becomes readable evidence of what a person has chosen, which is
--     the thing that was missing when these keys were only ever written;
--   · a future reader added in another surface inherits the same value rather
--     than picking its own default, which is the shape of this whole defect.
--
-- THE VALUES ARE THE BEHAVIOUR-PRESERVING ONES, not the frame's. The frame
-- shows one person's preferences with three of these on; writing those to
-- every existing row would move every planner in the product off today, put a
-- week number in every header and dim half of every grid, on the next deploy,
-- under cover of a bug fix. The three that change what an existing calendar
-- looks like default OFF and are opted into; the two that only ever add
-- something default ON, as the frame has them. These match the readers exactly
-- — `settings?.showWeekNumbers === true` against `false` here, and
-- `settings?.showRecurring !== false` against `true` — and if the two ever
-- drift, the drift is the bug this file exists to have prevented.
--
-- Idempotent: `||` only fills keys the row does not already have, because
-- jsonb concatenation lets the RIGHT side win and the existing object is on
-- the right. Re-running this overwrites nobody's choice.

UPDATE users
SET planner_settings =
      jsonb_build_object(
        'showWeekNumbers',           false,
        'alwaysOpenAtStartOfWeek',   false,
        'darkenNonWorkingHours',     false,
        'savePersonalEventsQuickly', true,
        'showRecurring',             true,
        'upcomingShowTimeLeft',      true,
        'upcomingQuickJoin',         true,
        'upcomingDesktopNotify',     false
      ) || COALESCE(planner_settings, '{}'::jsonb)
WHERE NOT (COALESCE(planner_settings, '{}'::jsonb) ?& ARRAY[
        'showWeekNumbers',
        'alwaysOpenAtStartOfWeek',
        'darkenNonWorkingHours',
        'savePersonalEventsQuickly',
        'showRecurring',
        'upcomingShowTimeLeft',
        'upcomingQuickJoin',
        'upcomingDesktopNotify'
      ]);
