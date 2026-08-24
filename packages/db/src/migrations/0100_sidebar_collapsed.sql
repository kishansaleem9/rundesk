-- §1.3 — the sidebar collapse becomes a preference of the person, not the browser.
--
-- "Agar main is ko off karoon to mujhe bas ICONS show hon — kyunke yeh SPACE
-- leta hai" [10:43]. That was stored in localStorage, so the choice held on one
-- machine and was forgotten on the next. §1.5 already settled that nav
-- preferences belong to the member; this is the same kind of choice.
--
-- Nullable on purpose: NULL means "never chosen", so an account that has not
-- touched the arrow keeps the expanded default instead of inheriting a false.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sidebar_collapsed" boolean;
