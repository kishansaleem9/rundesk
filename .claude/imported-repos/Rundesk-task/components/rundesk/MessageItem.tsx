"use client";

import {
  FileText,
  MessageCircle,
  Save,
  X,
} from "lucide-react";
import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  Message,
} from "@/lib/rundesk/types";

import Avatar from "./Avatar";
import EmojiGlyph from "./EmojiGlyph";
import MessageHoverActions from "./MessageHoverActions";

const mentionPattern =
  /(@[A-Za-z0-9_.-]+(?:\s[A-Za-z0-9_.-]+)?)/g;

function RichText({
  content,
}: {
  content: string;
}) {
  return (
    <>
      {content
        .split(mentionPattern)
        .map((part, index) =>
          part.startsWith("@") ? (
            <span
              className="mention"
              key={`${part}-${index}`}
            >
              {part}
            </span>
          ) : (
            part
          ),
        )}
    </>
  );
}

interface Props {
  message: Message;
  compact?: boolean;
  currentUserId: string;

  onReply: (
    message: Message,
  ) => void;

  onReact: (
    message: Message,
    emoji: string,
  ) => void;

  onEdit: (
    message: Message,
    content: string,
  ) => Promise<boolean>;

  onDelete: (
    message: Message,
  ) => void;

  onTask: (
    message: Message,
  ) => void;

  onAssign: (
    message: Message,
  ) => void;

  onMarkUnread: (
    message: Message,
  ) => void;
}

type ReminderChoice =
  | "1h"
  | "later-today"
  | "tomorrow"
  | "next-week";

type StoredReminder = {
  id: string;
  messageId: string;
  channelId: string;
  authorName: string;
  content: string;
  remindAt: number;
};

export default function MessageItem({
  message,
  compact = false,
  currentUserId,

  onReply,
  onReact,
  onEdit,
  onDelete,
  onTask,
  onAssign,
  onMarkUnread,
}: Props) {
  const [editing, setEditing] =
    useState(false);

  const [draft, setDraft] =
    useState(message.content);

  const [saving, setSaving] =
    useState(false);

  const editorRef =
    useRef<HTMLTextAreaElement>(
      null,
    );

  useEffect(() => {
    if (editing) {
      queueMicrotask(() => {
        editorRef.current?.focus();

        editorRef.current?.setSelectionRange(
          draft.length,
          draft.length,
        );
      });
    }
  }, [
    editing,
    draft.length,
  ]);

  const grouped =
    Object.values(
      message.reactions.reduce<
        Record<
          string,
          {
            emoji: string;
            count: number;
            mine: boolean;
            names: string[];
          }
        >
      >((result, reaction) => {
        result[
          reaction.emoji
        ] ??= {
          emoji:
            reaction.emoji,

          count: 0,
          mine: false,
          names: [],
        };

        result[
          reaction.emoji
        ].count += 1;

        result[
          reaction.emoji
        ].names.push(
          reaction.user.name,
        );

        if (
          reaction.userId ===
          currentUserId
        ) {
          result[
            reaction.emoji
          ].mine = true;
        }

        return result;
      }, {}),
    );

  async function copyLink() {
    const url =
      new URL(location.href);

    url.searchParams.set(
      "channel",
      message.channelId,
    );

    url.hash =
      `message-${message.id}`;

    try {
      await navigator.clipboard.writeText(
        url.toString(),
      );
    } catch {
      // Clipboard may be unavailable.
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(
        message.content,
      );
    } catch {
      // Clipboard may be unavailable.
    }
  }

  function quoteInReply() {
    /*
     * ThreadPanel reads this once when it opens,
     * then pre-fills the reply composer.
     */
    sessionStorage.setItem(
      `rundesk:thread-quote:${message.id}`,
      JSON.stringify({
        author:
          message.author.name,
        content:
          message.content,
      }),
    );

    onReply(message);
  }

  function reminderTime(
    choice: ReminderChoice,
  ) {
    const now = new Date();

    if (choice === "1h") {
      return (
        now.getTime() +
        60 * 60 * 1000
      );
    }

    if (
      choice ===
      "later-today"
    ) {
      const later =
        new Date(now);

      later.setHours(
        Math.max(
          now.getHours() + 3,
          17,
        ),
        0,
        0,
        0,
      );

      return later.getTime();
    }

    if (
      choice === "tomorrow"
    ) {
      const tomorrow =
        new Date(now);

      tomorrow.setDate(
        tomorrow.getDate() + 1,
      );

      tomorrow.setHours(
        9,
        0,
        0,
        0,
      );

      return tomorrow.getTime();
    }

    const nextWeek =
      new Date(now);

    nextWeek.setDate(
      nextWeek.getDate() + 7,
    );

    nextWeek.setHours(
      9,
      0,
      0,
      0,
    );

    return nextWeek.getTime();
  }

  function setReminder(
    choice: ReminderChoice,
  ) {
    const key =
      `rundesk:message-reminders:${currentUserId}`;

    let current:
      StoredReminder[] = [];

    try {
      const stored =
        localStorage.getItem(key);

      if (stored) {
        const parsed =
          JSON.parse(stored);

        if (
          Array.isArray(
            parsed,
          )
        ) {
          current =
            parsed;
        }
      }
    } catch {
      current = [];
    }

    const reminder:
      StoredReminder = {
      id:
        crypto.randomUUID(),

      messageId:
        message.id,

      channelId:
        message.channelId,

      authorName:
        message.author.name,

      content:
        message.content,

      remindAt:
        reminderTime(
          choice,
        ),
    };

    localStorage.setItem(
      key,
      JSON.stringify([
        ...current.filter(
          (item) =>
            item.messageId !==
            message.id,
        ),

        reminder,
      ]),
    );

    window.dispatchEvent(
      new CustomEvent(
        "rundesk:reminders-changed",
      ),
    );
  }

  async function saveEdit() {
    const next =
      draft.trim();

    if (
      !next ||
      next ===
        message.content
    ) {
      setEditing(false);

      setDraft(
        message.content,
      );

      return;
    }

    setSaving(true);

    const ok =
      await onEdit(
        message,
        next,
      );

    setSaving(false);

    if (ok) {
      setEditing(false);
    }
  }

  return (
    <article
      id={`message-${message.id}`}
      className={[
        "message-item",

        compact
          ? "compact"
          : "",

        editing
          ? "is-editing"
          : "",

        message.optimistic
          ? "optimistic"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!editing && (
        <MessageHoverActions
          own={
            message.authorId ===
            currentUserId
          }
          messageId={
            message.id
          }
          onReply={() =>
            onReply(message)
          }
          onReact={(emoji) =>
            onReact(
              message,
              emoji,
            )
          }
          onEdit={() => {
            setDraft(
              message.content,
            );

            setEditing(true);
          }}
          onDelete={() =>
            onDelete(message)
          }
          onTask={() =>
            onTask(message)
          }
          onAssign={() =>
            onAssign(message)
          }
          onCopy={() =>
            void copyMessage()
          }
          onCopyLink={() =>
            void copyLink()
          }
          onMarkUnread={() =>
            onMarkUnread(
              message,
            )
          }
          onQuote={
            quoteInReply
          }
          onRemind={
            setReminder
          }
        />
      )}

      <button
        className="message-avatar"
        title={
          message.author.name
        }
      >
        <Avatar
          user={message.author}
          size={31}
        />
      </button>

      <div className="message-body">
        <div className="message-meta">
          <strong>
            {message.author.name}
          </strong>

          <time>
            {new Intl.DateTimeFormat(
              "en",
              {
                hour: "numeric",
                minute:
                  "2-digit",
              },
            ).format(
              new Date(
                message.createdAt,
              ),
            )}
          </time>

          {message.editedAt && (
            <small>
              (edited)
            </small>
          )}
        </div>

        {editing ? (
          <div className="inline-message-editor">
            <textarea
              ref={
                editorRef
              }
              value={draft}
              onChange={(
                event,
              ) =>
                setDraft(
                  event.target
                    .value,
                )
              }
              onKeyDown={(
                event,
              ) => {
                if (
                  event.key ===
                  "Escape"
                ) {
                  setEditing(
                    false,
                  );

                  setDraft(
                    message.content,
                  );
                } else if (
                  event.key ===
                    "Enter" &&
                  !event.shiftKey
                ) {
                  event.preventDefault();

                  void saveEdit();
                }
              }}
            />

            <div>
              <span>
                Enter to save ·
                Shift+Enter for
                new line
              </span>

              <button
                className="edit-cancel"
                onClick={() => {
                  setEditing(
                    false,
                  );

                  setDraft(
                    message.content,
                  );
                }}
              >
                <X size={14} />
                Cancel
              </button>

              <button
                className="edit-save"
                disabled={
                  saving ||
                  !draft.trim()
                }
                onClick={() =>
                  void saveEdit()
                }
              >
                <Save
                  size={14}
                />

                {saving
                  ? "Saving…"
                  : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <p>
            <RichText
              content={
                message.content
              }
            />
          </p>
        )}

        {message.attachments.map(
          (file) =>
            file.mimeType.startsWith(
              "image/",
            ) ? (
              <a
                className="image-attachment"
                href={file.url}
                target="_blank"
                rel="noreferrer"
                key={
                  file.storageKey
                }
              >
                <Image
                  src={file.url}
                  alt={
                    file.originalName
                  }
                  width={280}
                  height={180}
                  unoptimized
                />

                <span>
                  {
                    file.originalName
                  }
                </span>
              </a>
            ) : file.mimeType.startsWith(
                "audio/",
              ) ? (
              <div
                className="voice-attachment"
                key={
                  file.storageKey
                }
              >
                <audio
                  controls
                  preload="metadata"
                  src={
                    file.url
                  }
                />

                <span>
                  {
                    file.originalName
                  }
                </span>
              </div>
            ) : (
              <a
                className="attachment-card"
                href={file.url}
                target="_blank"
                rel="noreferrer"
                key={
                  file.storageKey
                }
              >
                <FileText
                  size={16}
                />

                <span>
                  {
                    file.originalName
                  }
                </span>

                <small>
                  {Math.ceil(
                    file.size /
                      1024,
                  )}{" "}
                  KB
                </small>
              </a>
            ),
        )}

        {message.taskLinks?.map(
          (link) => (
            <button
              className="linked-task"
              key={
                link.taskId
              }
            >
              <i
                className={`status-${link.task.status.toLowerCase()}`}
              />

              <span>
                <strong>
                  {
                    link.task
                      .title
                  }
                </strong>

                <small>
                  {link.task.status.replace(
                    "_",
                    " ",
                  )}{" "}
                  ·{" "}
                  {
                    link.task
                      .priority
                  }
                </small>
              </span>
            </button>
          ),
        )}

        <div className="message-feedback">
          {grouped.map(
            (reaction) => (
              <button
                title={reaction.names.join(
                  ", ",
                )}
                className={
                  reaction.mine
                    ? "mine"
                    : ""
                }
                key={
                  reaction.emoji
                }
                onClick={() =>
                  onReact(
                    message,
                    reaction.emoji,
                  )
                }
              >
                <EmojiGlyph
                  emoji={
                    reaction.emoji
                  }
                  size={15}
                />

                <span>
                  {
                    reaction.count
                  }
                </span>
              </button>
            ),
          )}

          {message._count
            .replies > 0 && (
            <button
              className="reply-count"
              onClick={() =>
                onReply(
                  message,
                )
              }
            >
              <MessageCircle
                size={13}
              />

              {
                message._count
                  .replies
              }{" "}
              {message._count
                .replies === 1
                ? "reply"
                : "replies"}

              <span>
                View thread
              </span>
            </button>
          )}

          {message.optimistic && (
            <small className="sending-label">
              Sending…
            </small>
          )}
        </div>
      </div>
    </article>
  );
}
