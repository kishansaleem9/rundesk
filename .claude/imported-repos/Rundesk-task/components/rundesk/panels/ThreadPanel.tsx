"use client";

import {
  Bell,
  BellOff,
  LoaderCircle,
  Send,
  Smile,
  X,
} from "lucide-react";
import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { api } from "@/lib/rundesk/api";

import type {
  ApiReaction,
  Message,
  User,
} from "@/lib/rundesk/types";

import MessageHoverActions from "../MessageHoverActions";

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

function reminderTime(
  choice: ReminderChoice,
) {
  const now =
    new Date();

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

function Row({
  message,
  currentUser,
  rootMessageId,
  canEdit,
  onChanged,
  onQuote,
}: {
  message: Message;
  currentUser: User;
  rootMessageId: string;
  canEdit: boolean;

  onChanged: (
    message: Message,
  ) => void;

  onQuote: (
    message: Message,
  ) => void;
}) {
  const [localMessage, setLocalMessage] =
    useState(message);

  useEffect(() => {
    setLocalMessage(message);
  }, [message]);

  async function react(
    emoji: string,
  ) {
    const result =
      await api<{
        reactions:
          ApiReaction[];
      }>(
        `/api/messages/${localMessage.id}/reactions`,
        {
          method: "POST",
          body:
            JSON.stringify({
              emoji,
            }),
        },
      );

    const next = {
      ...localMessage,

      reactions:
        result.reactions,
    };

    setLocalMessage(next);
    onChanged(next);
  }

  async function edit() {
    const content =
      prompt(
        "Edit reply",
        localMessage.content,
      )?.trim();

    if (!content) {
      return;
    }

    const updated =
      await api<Message>(
        `/api/messages/${localMessage.id}`,
        {
          method: "PATCH",

          body:
            JSON.stringify({
              content,
            }),
        },
      );

    setLocalMessage(updated);
    onChanged(updated);
  }

  async function remove() {
    if (
      !confirm(
        "Delete this reply?",
      )
    ) {
      return;
    }

    await api(
      `/api/messages/${localMessage.id}`,
      {
        method: "DELETE",
      },
    );

    onChanged({
      ...localMessage,
      content: "",
    });
  }

  async function copyLink() {
    const url =
      new URL(location.href);

    url.searchParams.set(
      "channel",
      localMessage.channelId,
    );

    url.hash =
      `message-${localMessage.id}`;

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
        localMessage.content,
      );
    } catch {
      // Clipboard may be unavailable.
    }
  }

  async function markUnread() {
    await api(
      `/api/channels/${localMessage.channelId}/read`,
      {
        method: "PATCH",

        body:
          JSON.stringify({
            before:
              localMessage.createdAt,
          }),
      },
    );
  }

  function setReminder(
    choice: ReminderChoice,
  ) {
    const key =
      `rundesk:message-reminders:${currentUser.id}`;

    let current:
      StoredReminder[] = [];

    try {
      const raw =
        localStorage.getItem(
          key,
        );

      if (raw) {
        const parsed =
          JSON.parse(raw);

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

    localStorage.setItem(
      key,
      JSON.stringify([
        ...current.filter(
          (item) =>
            item.messageId !==
            localMessage.id,
        ),

        {
          id:
            crypto.randomUUID(),

          messageId:
            localMessage.id,

          channelId:
            localMessage.channelId,

          authorName:
            localMessage.author.name,

          content:
            localMessage.content,

          remindAt:
            reminderTime(
              choice,
            ),
        },
      ]),
    );

    window.dispatchEvent(
      new CustomEvent(
        "rundesk:reminders-changed",
      ),
    );
  }

  if (!localMessage.content) {
    return null;
  }

  return (
    <div className="thread-message clickup-thread-message">
      <MessageHoverActions
        own={
          canEdit &&
          localMessage.authorId ===
            currentUser.id
        }
        messageId={
          localMessage.id
        }
        followMessageId={
          rootMessageId
        }
        onReply={() =>
          onQuote(
            localMessage,
          )
        }
        onReact={(emoji) =>
          void react(emoji)
        }
        onEdit={
          canEdit
            ? () =>
                void edit()
            : undefined
        }
        onDelete={
          canEdit
            ? () =>
                void remove()
            : undefined
        }
        onCopy={() =>
          void copyMessage()
        }
        onCopyLink={() =>
          void copyLink()
        }
        onMarkUnread={() =>
          void markUnread()
        }
        onQuote={() =>
          onQuote(
            localMessage,
          )
        }
        onRemind={
          setReminder
        }
      />

      <i className="thread-avatar">
        {localMessage.author.name
          .split(" ")
          .map(
            (part) =>
              part[0],
          )
          .join("")
          .slice(0, 2)}
      </i>

      <div className="thread-message-copy">
        <div className="thread-message-meta">
          <strong>
            {
              localMessage.author
                .name
            }
          </strong>

          <time>
            {new Date(
              localMessage.createdAt,
            ).toLocaleTimeString(
              [],
              {
                hour:
                  "numeric",

                minute:
                  "2-digit",
              },
            )}

            {localMessage.editedAt
              ? " · Edited"
              : ""}
          </time>
        </div>

        <p>
          {localMessage.content}
        </p>
      </div>
    </div>
  );
}

export default function ThreadPanel({
  message,
  currentUser,
  onClose,
  onReplyAdded,
}: {
  message: Message;
  currentUser: User;
  onClose: () => void;
  onReplyAdded: () => void;
}) {
  const [replies, setReplies] =
    useState<Message[]>([]);

  const [content, setContent] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [following, setFollowing] =
    useState(false);

  const composerRef =
    useRef<HTMLTextAreaElement>(
      null,
    );

  useEffect(() => {
    Promise.all([
      api<Message[]>(
        `/api/messages/${message.id}/replies`,
      ),

      api<{
        following: boolean;
      }>(
        `/api/messages/${message.id}/follow`,
      ),
    ])
      .then(
        ([
          items,
          state,
        ]) => {
          setReplies(items);

          setFollowing(
            state.following,
          );
        },
      )
      .catch((reason) =>
        setError(
          reason.message,
        ),
      )
      .finally(() =>
        setLoading(false),
      );

    const quoteKey =
      `rundesk:thread-quote:${message.id}`;

    const storedQuote =
      sessionStorage.getItem(
        quoteKey,
      );

    if (storedQuote) {
      try {
        const parsed =
          JSON.parse(
            storedQuote,
          ) as {
            author?: string;
            content?: string;
          };

        if (
          parsed.content
        ) {
          setContent(
            `> ${parsed.author ?? "Message"}: ${parsed.content}\n\n`,
          );
        }
      } catch {
        // Ignore malformed quote state.
      }

      sessionStorage.removeItem(
        quoteKey,
      );

      queueMicrotask(() =>
        composerRef.current?.focus(),
      );
    }
  }, [message.id]);

  function quoteMessage(
    source: Message,
  ) {
    setContent(
      (current) =>
        `${current}${current ? "\n" : ""}> ${source.author.name}: ${source.content}\n\n`,
    );

    queueMicrotask(() =>
      composerRef.current?.focus(),
    );
  }

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!content.trim()) {
      return;
    }

    try {
      const reply =
        await api<Message>(
          `/api/messages/${message.id}/replies`,
          {
            method: "POST",

            body:
              JSON.stringify({
                content,
              }),
          },
        );

      setReplies(
        (current) => [
          ...current,
          reply,
        ],
      );

      setContent("");
      onReplyAdded();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Reply failed",
      );
    }
  }

  async function follow() {
    const result =
      await api<{
        following: boolean;
      }>(
        `/api/messages/${message.id}/follow`,
        {
          method: "POST",
        },
      );

    setFollowing(
      result.following,
    );
  }

  return (
    <aside className="detail-panel thread-panel">
      <header>
        <div>
          <h2>
            Thread
          </h2>

          <span>
            {replies.length}{" "}
            {replies.length === 1
              ? "reply"
              : "replies"}
          </span>
        </div>

        <div className="thread-head-actions">
          <button
            onClick={() =>
              void follow()
            }
            title={
              following
                ? "Unfollow thread"
                : "Follow thread"
            }
          >
            {following ? (
              <BellOff
                size={16}
              />
            ) : (
              <Bell
                size={16}
              />
            )}
          </button>

          <button
            onClick={
              onClose
            }
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="thread-scroll">
        <Row
          message={
            message
          }
          currentUser={
            currentUser
          }
          rootMessageId={
            message.id
          }
          canEdit={false}
          onChanged={() => {
            /*
             * The root copy is owned by the main
             * channel message list.
             */
          }}
          onQuote={
            quoteMessage
          }
        />

        <div className="thread-divider">
          Replies
        </div>

        {loading ? (
          <LoaderCircle className="spin" />
        ) : (
          replies.map(
            (reply) => (
              <Row
                key={
                  reply.id
                }
                message={
                  reply
                }
                currentUser={
                  currentUser
                }
                rootMessageId={
                  message.id
                }
                canEdit
                onQuote={
                  quoteMessage
                }
                onChanged={(
                  updated,
                ) =>
                  setReplies(
                    (
                      current,
                    ) =>
                      updated.content
                        ? current.map(
                            (
                              item,
                            ) =>
                              item.id ===
                              updated.id
                                ? updated
                                : item,
                          )
                        : current.filter(
                            (
                              item,
                            ) =>
                              item.id !==
                              updated.id,
                          ),
                  )
                }
              />
            ),
          )
        )}

        {error && (
          <p className="form-error">
            {error}
          </p>
        )}
      </div>

      <form
        className="thread-composer"
        onSubmit={submit}
      >
        <button
          type="button"
          title="Emoji"
        >
          <Smile size={16} />
        </button>

        <textarea
          ref={
            composerRef
          }
          value={content}
          onChange={(
            event,
          ) =>
            setContent(
              event.target.value,
            )
          }
          placeholder={`Reply as ${currentUser.name}`}
        />

        <button
          disabled={
            !content.trim()
          }
        >
          <Send size={16} />
        </button>
      </form>
    </aside>
  );
}
