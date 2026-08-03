-- User-named channel groups for the chat rail (§A3.4). Grouping was derived
-- from a channel's space, which breaks the moment one client spans two spaces
-- or a channel belongs to no space at all. Groups are per-user: the rail is a
-- personal organisation of the same shared channels, so one person's "Clients"
-- bucket never reshuffles anyone else's sidebar.
CREATE TABLE IF NOT EXISTS "chat_channel_groups" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name"         text NOT NULL,
  "position"     integer NOT NULL DEFAULT 0,
  -- Collapse state lives with the group so it survives a reload.
  "is_collapsed" boolean NOT NULL DEFAULT false,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "chat_channel_groups_owner_idx"
  ON "chat_channel_groups" ("workspace_id", "user_id");

-- Membership rows. A channel sits in at most one of its owner's groups, so the
-- rail never renders the same channel twice; moving it re-points this row.
CREATE TABLE IF NOT EXISTS "chat_channel_group_items" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id"   uuid NOT NULL REFERENCES "chat_channel_groups"("id") ON DELETE CASCADE,
  "channel_id" uuid NOT NULL REFERENCES "chat_channels"("id") ON DELETE CASCADE,
  "position"   integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_channel_group_items_unique"
  ON "chat_channel_group_items" ("group_id", "channel_id");
CREATE INDEX IF NOT EXISTS "chat_channel_group_items_channel_idx"
  ON "chat_channel_group_items" ("channel_id");
