-- §G15 — keep `lists.space_id` equal to its project's space, always.
--
-- 0124 added the column and backfilled it. Keeping it true is the harder half:
-- there are five places that insert a list today (list create, workspace seed,
-- sample data, project templates, the ClickUp importer) and a list can also be
-- MOVED between projects. Patching five call sites fixes the five that exist
-- and silently rots the column the day a sixth appears — including any raw SQL,
-- seed or import that never goes through the service layer.
--
-- So it is derived where it cannot be bypassed. The project is the single
-- source of truth; this makes the denormalisation follow it rather than asking
-- every writer to remember.
CREATE OR REPLACE FUNCTION lists_set_space_from_project() RETURNS trigger AS $$
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT p.space_id INTO NEW.space_id FROM projects p WHERE p.id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lists_space_from_project ON lists;
CREATE TRIGGER trg_lists_space_from_project
  BEFORE INSERT OR UPDATE OF project_id ON lists
  FOR EACH ROW EXECUTE FUNCTION lists_set_space_from_project();
