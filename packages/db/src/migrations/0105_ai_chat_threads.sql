-- §15 — AI chats that outlive the panel.
--
-- Frames 296_1817 → 297_1820 → 301_1836 → 304_1907: a conversation starts as
-- "New Chat", renames itself from its content to "Skill Definition and Ideas",
-- and is still in the sidebar after the panel is closed. Rundesk's AI panel
-- kept its messages in React state, so closing it discarded the conversation —
-- including the one where you worked out what a skill should be.
CREATE TABLE IF NOT EXISTS "ai_chat_threads" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"  uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id"       uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title"         text DEFAULT 'New Chat' NOT NULL,
  -- 'yes' until the title has been derived from the conversation. A thread a
  -- person renamed must never be renamed back out from under them.
  "title_is_auto" text DEFAULT 'yes' NOT NULL,
  "skill_id"      uuid REFERENCES "skills"("id") ON DELETE SET NULL,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"    timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_ai_chat_threads_user_ws"
  ON "ai_chat_threads" ("user_id", "workspace_id", "updated_at");

CREATE TABLE IF NOT EXISTS "ai_chat_messages" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "thread_id"  uuid NOT NULL REFERENCES "ai_chat_threads"("id") ON DELETE CASCADE,
  "role"       text NOT NULL,
  "content"    text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_ai_chat_messages_thread"
  ON "ai_chat_messages" ("thread_id", "created_at");
