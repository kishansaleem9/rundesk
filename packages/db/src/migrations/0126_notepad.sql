-- §6 [08:35], frame 087_0535 — "Personal Tools": Create task · My Work ·
-- Track Time · **Notepad** · Record a Clip · Talk to Text · …
--
-- A personal scratch pad, pinnable to the top bar like the other Personal
-- Tools. One row per person: this is the back of an envelope, not a document
-- system — Docs already exist for anything that wants a title, sharing or a
-- place in the tree.
--
-- Not workspace-scoped on purpose. It belongs to the person, the way ClickUp's
-- does; scoping it per workspace would mean a thought jotted in one workspace
-- vanishing when they switch, which is the opposite of a scratch pad.
CREATE TABLE IF NOT EXISTS "user_notepads" (
  "user_id"    uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "content"    text NOT NULL DEFAULT '',
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
