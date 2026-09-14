"use client";

import {
  AtSign,
  Check,
  Clock3,
  Heart,
  LoaderCircle,
  MessageSquareReply,
  UserRoundCheck,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { api } from "@/lib/rundesk/api";

type Activity = {
  mentions: Array<{
    messageId: string;
    createdAt: string;

    message: {
      id: string;
      channelId: string;
      content: string;

      author: {
        name: string;
      };

      channel: {
        name: string;
      };
    };
  }>;

  reactions: Array<{
    messageId: string;
    emoji: string;
    createdAt: string;

    user: {
      name: string;
    };

    message: {
      id: string;
      channelId: string;
      content: string;

      channel: {
        name: string;
      };
    };
  }>;

  assignments: Array<{
    id: string;
    messageId: string;
    assigneeId: string;
    resolvedAt:
      | string
      | null;

    message: {
      id: string;
      channelId: string;
      content: string;

      channel: {
        name: string;
      };
    };

    assignedBy: {
      name: string;
    };
  }>;

  threads: Array<{
    id: string;
    parentMessageId:
      | string
      | null;

    channelId: string;
    content: string;
    createdAt: string;

    author: {
      name: string;
    };

    channel: {
      name: string;
    };
  }>;
};

type StoredReminder = {
  id: string;
  messageId: string;
  channelId: string;
  authorName: string;
  content: string;
  remindAt: number;
};

type Mode =
  | "inbox"
  | "replies"
  | "assigned";

export default function ActivityPanel({
  mode,
  currentUserId,
  onClose,
  onOpenMessage,
}: {
  mode: Mode;
  currentUserId: string;
  onClose: () => void;

  onOpenMessage?: (
    channelId: string,
    messageId: string,
  ) => void;
}) {
  const [data, setData] =
    useState<Activity | null>(
      null,
    );

  const [
    reminders,
    setReminders,
  ] = useState<
    StoredReminder[]
  >([]);

  const [tab, setTab] =
    useState<
      "open" | "resolved"
    >("open");

  const [
    replyTab,
    setReplyTab,
  ] = useState<
    "unread" | "read"
  >("unread");

  const [error, setError] =
    useState("");

  const [
    replyReadAt,
    setReplyReadAt,
  ] = useState(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return 0;
    }

    const saved =
      Number(
        localStorage.getItem(
          `rundesk:reply-read-at:${currentUserId}`,
        ),
      );

    return Number.isFinite(
      saved,
    )
      ? saved
      : 0;
  });

  const reminderKey =
    `rundesk:message-reminders:${currentUserId}`;

  const load = () =>
    api<Activity>(
      "/api/activity",
    )
      .then(setData)
      .catch((reason) =>
        setError(
          reason.message,
        ),
      );

  function loadReminders() {
    try {
      const raw =
        localStorage.getItem(
          reminderKey,
        );

      const parsed =
        raw
          ? JSON.parse(raw)
          : [];

      const items:
        StoredReminder[] =
        Array.isArray(
          parsed,
        )
          ? parsed
          : [];

      setReminders(
        items
          .filter(
            (item) =>
              Number(
                item.remindAt,
              ) <=
              Date.now(),
          )
          .sort(
            (a, b) =>
              a.remindAt -
              b.remindAt,
          ),
      );
    } catch {
      setReminders([]);
    }
  }

  useEffect(() => {
    void load();

    loadReminders();

    const timer =
      window.setInterval(
        loadReminders,
        30000,
      );

    const changed = () =>
      loadReminders();

    window.addEventListener(
      "rundesk:reminders-changed",
      changed,
    );

    return () => {
      window.clearInterval(
        timer,
      );

      window.removeEventListener(
        "rundesk:reminders-changed",
        changed,
      );
    };
  }, []);

  const assigned =
    useMemo(
      () =>
        data?.assignments.filter(
          (item) =>
            tab ===
            "resolved"
              ? Boolean(
                  item.resolvedAt,
                )
              : !item.resolvedAt,
        ) ?? [],
      [data, tab],
    );

  const threads =
    useMemo(
      () =>
        data?.threads.filter(
          (item) =>
            replyTab ===
            "read"
              ? new Date(
                  item.createdAt,
                ).getTime() <=
                replyReadAt
              : new Date(
                  item.createdAt,
                ).getTime() >
                replyReadAt,
        ) ?? [],
      [
        data,
        replyTab,
        replyReadAt,
      ],
    );

  async function resolve(
    item: Activity["assignments"][number],
    resolved: boolean,
  ) {
    await api(
      `/api/messages/${item.messageId}/assignment`,
      {
        method: "POST",

        body:
          JSON.stringify({
            assigneeId:
              item.assigneeId,

            resolved,
          }),
      },
    );

    await load();
  }

  const open = (
    channelId: string,
    messageId: string,
  ) => {
    onOpenMessage?.(
      channelId,
      messageId,
    );
  };

  function openReminder(
    reminder:
      StoredReminder,
  ) {
    let all:
      StoredReminder[] = [];

    try {
      const raw =
        localStorage.getItem(
          reminderKey,
        );

      all =
        raw
          ? JSON.parse(raw)
          : [];
    } catch {
      all = [];
    }

    localStorage.setItem(
      reminderKey,
      JSON.stringify(
        all.filter(
          (item) =>
            item.id !==
            reminder.id,
        ),
      ),
    );

    loadReminders();

    open(
      reminder.channelId,
      reminder.messageId,
    );
  }

  const markRepliesRead =
    () => {
      const now =
        Date.now();

      setReplyReadAt(now);

      localStorage.setItem(
        `rundesk:reply-read-at:${currentUserId}`,
        String(now),
      );

      setReplyTab("read");
    };

  const inboxEmpty =
    Boolean(data) &&
    reminders.length === 0 &&
    !data?.mentions.length &&
    !data?.reactions.length &&
    !data?.threads.length;

  return (
    <aside className="detail-panel activity-panel">
      <header>
        <div>
          <h2>
            {mode ===
            "assigned"
              ? "Assigned messages"
              : mode ===
                  "replies"
                ? "Replies"
                : "Inbox"}
          </h2>

          {mode ===
            "assigned" && (
            <span>
              Convert assigned
              messages into tasks
            </span>
          )}
        </div>

        <button
          onClick={
            onClose
          }
        >
          <X size={18} />
        </button>
      </header>

      {mode ===
        "assigned" && (
        <div className="panel-tabs">
          <button
            className={
              tab === "open"
                ? "active"
                : ""
            }
            onClick={() =>
              setTab("open")
            }
          >
            Open
          </button>

          <button
            className={
              tab ===
              "resolved"
                ? "active"
                : ""
            }
            onClick={() =>
              setTab(
                "resolved",
              )
            }
          >
            Resolved
          </button>
        </div>
      )}

      {mode ===
        "replies" && (
        <div className="panel-tabs replies-tabs">
          <button
            className={
              replyTab ===
              "unread"
                ? "active"
                : ""
            }
            onClick={() =>
              setReplyTab(
                "unread",
              )
            }
          >
            Unread
          </button>

          <button
            className={
              replyTab ===
              "read"
                ? "active"
                : ""
            }
            onClick={() =>
              setReplyTab(
                "read",
              )
            }
          >
            Read
          </button>
        </div>
      )}

      <div className="activity-list">
        {!data &&
          !error && (
            <div className="panel-center">
              <LoaderCircle className="spin" />
            </div>
          )}

        {mode ===
          "replies" &&
          threads.map(
            (reply) => (
              <button
                key={
                  reply.id
                }
                onClick={() =>
                  open(
                    reply.channelId,
                    reply.parentMessageId ??
                      reply.id,
                  )
                }
              >
                <i>
                  <MessageSquareReply
                    size={15}
                  />
                </i>

                <span>
                  <strong>
                    {
                      reply.author
                        .name
                    }
                  </strong>

                  <small>
                    #
                    {
                      reply.channel
                        .name
                    }{" "}
                    ·{" "}
                    {new Date(
                      reply.createdAt,
                    ).toLocaleString(
                      [],
                      {
                        month:
                          "short",

                        day:
                          "numeric",

                        hour:
                          "numeric",

                        minute:
                          "2-digit",
                      },
                    )}
                  </small>

                  <p>
                    {
                      reply.content
                    }
                  </p>
                </span>
              </button>
            ),
          )}

        {mode ===
          "assigned" &&
          assigned.map(
            (item) => (
              <div
                className="assignment-activity"
                key={
                  item.id
                }
              >
                <button
                  onClick={() =>
                    open(
                      item.message
                        .channelId,

                      item.messageId,
                    )
                  }
                >
                  <i>
                    <UserRoundCheck
                      size={15}
                    />
                  </i>

                  <span>
                    <strong>
                      #
                      {
                        item
                          .message
                          .channel
                          .name
                      }
                    </strong>

                    <small>
                      Assigned by{" "}
                      {
                        item
                          .assignedBy
                          .name
                      }
                    </small>

                    <p>
                      {
                        item
                          .message
                          .content
                      }
                    </p>
                  </span>
                </button>

                <button
                  className="assignment-resolve"
                  onClick={() =>
                    void resolve(
                      item,
                      !item.resolvedAt,
                    )
                  }
                >
                  {item.resolvedAt
                    ? "Reopen"
                    : "Resolve"}
                </button>
              </div>
            ),
          )}

        {mode ===
          "inbox" &&
          data && (
            <>
              {reminders.map(
                (reminder) => (
                  <button
                    key={
                      reminder.id
                    }
                    className="reminder-activity"
                    onClick={() =>
                      openReminder(
                        reminder,
                      )
                    }
                  >
                    <i>
                      <Clock3
                        size={15}
                      />
                    </i>

                    <span>
                      <strong>
                        Reminder
                      </strong>

                      <small>
                        From{" "}
                        {
                          reminder.authorName
                        }
                      </small>

                      <p>
                        {
                          reminder.content
                        }
                      </p>
                    </span>
                  </button>
                ),
              )}

              {data.mentions.map(
                (item) => (
                  <button
                    key={`m-${item.messageId}-${item.createdAt}`}
                    onClick={() =>
                      open(
                        item.message
                          .channelId,

                        item.messageId,
                      )
                    }
                  >
                    <i>
                      <AtSign
                        size={15}
                      />
                    </i>

                    <span>
                      <strong>
                        {
                          item
                            .message
                            .author
                            .name
                        }{" "}
                        mentioned you
                      </strong>

                      <small>
                        #
                        {
                          item
                            .message
                            .channel
                            .name
                        }
                      </small>

                      <p>
                        {
                          item
                            .message
                            .content
                        }
                      </p>
                    </span>
                  </button>
                ),
              )}

              {data.reactions.map(
                (item) => (
                  <button
                    key={`r-${item.messageId}-${item.createdAt}`}
                    onClick={() =>
                      open(
                        item.message
                          .channelId,

                        item.messageId,
                      )
                    }
                  >
                    <i>
                      <Heart
                        size={15}
                      />
                    </i>

                    <span>
                      <strong>
                        {
                          item.user
                            .name
                        }{" "}
                        reacted{" "}
                        {
                          item.emoji
                        }
                      </strong>

                      <small>
                        #
                        {
                          item
                            .message
                            .channel
                            .name
                        }
                      </small>

                      <p>
                        {
                          item
                            .message
                            .content
                        }
                      </p>
                    </span>
                  </button>
                ),
              )}

              {data.threads.map(
                (item) => (
                  <button
                    key={`t-${item.id}`}
                    onClick={() =>
                      open(
                        item.channelId,

                        item.parentMessageId ??
                          item.id,
                      )
                    }
                  >
                    <i>
                      <MessageSquareReply
                        size={15}
                      />
                    </i>

                    <span>
                      <strong>
                        {
                          item.author
                            .name
                        }{" "}
                        replied
                      </strong>

                      <small>
                        #
                        {
                          item.channel
                            .name
                        }
                      </small>

                      <p>
                        {
                          item.content
                        }
                      </p>
                    </span>
                  </button>
                ),
              )}
            </>
          )}

        {data &&
          ((mode ===
            "assigned" &&
            assigned.length ===
              0) ||
            (mode ===
              "replies" &&
              threads.length ===
                0) ||
            (mode ===
              "inbox" &&
              inboxEmpty)) && (
            <div className="panel-empty">
              <span className="empty-icon">
                <Check
                  size={30}
                />
              </span>

              <strong>
                {mode ===
                "assigned"
                  ? "You have no messages to resolve!"
                  : mode ===
                      "replies"
                    ? replyTab ===
                      "unread"
                      ? "No unread replies"
                      : "No read replies yet"
                    : "You're all caught up"}
              </strong>

              <p>
                {mode ===
                "assigned"
                  ? "Assigned messages will appear here."
                  : mode ===
                      "replies"
                    ? "Thread replies you follow will appear here."
                    : "Mentions, reactions, reminders, and thread updates will appear here."}
              </p>
            </div>
          )}

        {error && (
          <p className="form-error">
            {error}
          </p>
        )}
      </div>

      {mode ===
        "replies" &&
        replyTab ===
          "unread" &&
        threads.length >
          0 && (
          <footer className="panel-footer">
            <button
              className="secondary-wide"
              onClick={
                markRepliesRead
              }
            >
              Mark all replies
              read
            </button>
          </footer>
        )}
    </aside>
  );
}
