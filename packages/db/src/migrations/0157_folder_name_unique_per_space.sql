-- §V2-S10 — "Folder name taken", frames `08:25` and `08:55`.
--
-- At `[08:23]` she makes a folder and says, in as many words, "folder ka bhi
-- SAME NAAM dete hain" — let's give the folder the same name too. At `[08:55]`
-- she narrates what should answer: "agar koi error aata hai to yeh yahan show
-- kar deta hai", over two stacked bottom-left toasts reading "List name taken".
--
-- The toast is the general answer to a refused create. It was implemented for
-- LISTS only (migration 0147, `assertListNameFree`) and not for the sibling
-- container created from the same eight-item Create menu: `foldersService.create`
-- inserted whatever it was handed, so one space could hold three folders called
-- "Clients" and the tree gave you nothing but their ids to tell them apart.
--
-- This is 0147's index for folders, stated the same three ways on purpose — two
-- containers with one rule must not be able to drift:
--
--   CASE-INSENSITIVE, because "Clients" and "clients" are the same name to the
--   person reading the sidebar, and a constraint that let both through would be
--   enforcing a rule nobody means.
--
--   PARTIAL, on `is_archived = false`. `FoldersService.remove` ARCHIVES a folder
--   so it can come back out of the Trash (§13.4); a name sitting in the bin must
--   not be reserved for ever. Deleting "Clients" and making a new one is an
--   ordinary thing to do.
--
--   SCOPED TO THE SPACE, which is the container the sidebar draws folders under
--   — `idx_folders_space` is on `(space_id, position)` for the same reason. Two
--   spaces may each have a "Clients"; one space may not.
--
-- Three write paths reach this namespace and all three are now answered in the
-- service with a 409 before the index has to: `create`, `update` (rename), and
-- `move` (carrying a name into a space that already has it).

-- Existing duplicates first, or the index cannot be created at all. The oldest
-- keeps the name; the rest are suffixed, which is visible and reversible rather
-- than silently merged or deleted. Same treatment 0147 gave lists.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY space_id, lower(name)
      ORDER BY created_at, id
    ) AS rn
  FROM folders
  WHERE is_archived = false
)
UPDATE folders
SET name = folders.name || ' (' || ranked.rn || ')'
FROM ranked
WHERE folders.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_folders_space_name_active
  ON folders (space_id, lower(name))
  WHERE is_archived = false;
