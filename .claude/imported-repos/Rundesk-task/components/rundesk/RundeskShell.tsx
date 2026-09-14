
"use client";

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Database,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import { api } from "@/lib/rundesk/api";

import type {
  ApiReaction,
  BootstrapData,
  Channel,
  Conversation,
  Message,
  MessageAttachment,
  Task,
  User,
} from "@/lib/rundesk/types";

import ChatHeader from "./ChatHeader";
import Composer from "./Composer";
import MessageList from "./MessageList";
import Sidebar from "./Sidebar";
import TopAppBar from "./TopAppBar";
import RightRail from "./RightRail";
import { useResizablePanel } from "./useResizablePanels";

import ChannelModal from "./panels/ChannelModal";
import AssignMessagePanel from "./panels/AssignMessagePanel";
import ChannelDetailsPanel from "./panels/ChannelDetailsPanel";
import DmModal from "./panels/DmModal";
import NewMenu from "./panels/NewMenu";
import SearchPanel from "./panels/SearchPanel";
import TasksPanel from "./panels/TasksPanel";
import ThreadPanel from "./panels/ThreadPanel";
import MembersPanel from "./panels/MembersPanel";
import ActivityPanel from "./panels/ActivityPanel";
import AdminMembersPanel from "./panels/AdminMembersPanel";

type Panel =
  | "search"
  | "channel-search"
  | "tasks"
  | "dm"
  | "details"
  | "members"
  | "inbox"
  | "replies"
  | "assigned"
  | "admin"
  | null;

type TaskDraft = {
  sourceMessageId: string;
  content: string;
} | null;

export default function RundeskShell() {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [selected, setSelected] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [channelMembers, setChannelMembers] = useState<User[]>([]);
  const [notificationsMuted, setNotificationsMuted] = useState(false);

  const [loading, setLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);

  const [error, setError] = useState("");
  const [messageError, setMessageError] = useState("");

  const [channelModal, setChannelModal] = useState<
    Channel | "new" | null
  >(null);

  const [thread, setThread] = useState<Message | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [newMenu, setNewMenu] = useState(false);

  const [taskViewTitle, setTaskViewTitle] =
    useState("My Tasks");

  const [panelTasks, setPanelTasks] = useState<Task[]>([]);
  const [taskDraft, setTaskDraft] =
    useState<TaskDraft>(null);

  const [assignmentTarget, setAssignmentTarget] =
    useState<Message | null>(null);

  const [drafts, setDrafts] = useState<
    Record<string, string>
  >({});

  const scrollRef = useRef<HTMLDivElement>(null);

 
  /*
   * Chat navigation:
   *
   * - Defaults to 260px, closer to ClickUp Chat.
   * - Can be dragged between 200px and 360px.
   * - Can completely collapse so the conversation
   *   gets the available horizontal space.
   */
  const chatLayout = useResizablePanel({
    key: "rundesk-chat-sidebar",
    defaultWidth: 260,
    minWidth: 200,
    maxWidth: 360,
    collapsedWidth: 0,
  });

  useEffect(() => {
    api<BootstrapData>("/api/bootstrap")
      .then(async (result) => {
        setData(result);

        const params = new URLSearchParams(
          location.search,
        );

        const requested = params.get("channel");

        const first =
          [
            ...result.channels,
            ...result.conversations.map(
              (item) => item.channel,
            ),
          ].find((item) => item.id === requested) ??
          result.channels[0] ??
          result.conversations[0]?.channel ??
          null;

        setSelected(first);

        if (first) {
          try {
            const [items, members] =
              await Promise.all([
                api<Message[]>(
                  `/api/channels/${first.id}/messages`,
                ),

                api<
                  Array<{
                    userId: string;
                    notificationsMuted?: boolean;
                    user: User;
                  }>
                >(
                  `/api/channels/${first.id}/members`,
                ),
              ]);

            setMessages(items);

            setChannelMembers(
              members.map((item) => item.user),
            );

            setNotificationsMuted(
              Boolean(
                members.find(
                  (item) =>
                    item.userId ===
                    result.currentUser.id,
                )?.notificationsMuted,
              ),
            );
          } catch (reason) {
            setMessageError(
              reason instanceof Error
                ? reason.message
                : "Failed to load messages",
            );
          }
        }
      })
      .catch((reason) =>
        setError(reason.message),
      )
      .finally(() => setLoading(false));
  }, []);

  async function loadMessages(channel: Channel) {
    setMessageLoading(true);
    setMessageError("");

    try {
      const [items, members] = await Promise.all([
        api<Message[]>(
          `/api/channels/${channel.id}/messages`,
        ),

        api<
          Array<{
            userId: string;
            notificationsMuted?: boolean;
            user: User;
          }>
        >(`/api/channels/${channel.id}/members`),
      ]);

      setMessages(items);

      setChannelMembers(
        members.map((item) => item.user),
      );

      setNotificationsMuted(
        Boolean(
          members.find(
            (item) =>
              item.userId === data?.currentUser.id,
          )?.notificationsMuted,
        ),
      );

      return items;
    } catch (reason) {
      setMessageError(
        reason instanceof Error
          ? reason.message
          : "Failed to load messages",
      );

      return [];
    } finally {
      setMessageLoading(false);
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    const stored = localStorage.getItem(
      "rundesk-drafts",
    );

    if (stored) {
      try {
        const parsed = JSON.parse(
          stored,
        ) as Record<string, string>;

        queueMicrotask(() => setDrafts(parsed));
      } catch {
        // Ignore invalid local draft state.
      }
    }

    const keys = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setPanel("search");
      } else if (event.key === "Escape") {
        setPanel(null);
        setThread(null);
        setAssignmentTarget(null);
        setNewMenu(false);
      }
    };

    window.addEventListener("keydown", keys);

    return () =>
      window.removeEventListener(
        "keydown",
        keys,
      );
  }, []);

  const selectChannel = (channel: Channel) => {
    setSelected(channel);
    setThread(null);
    setPanel(null);

    void loadMessages(channel);

    void api(
      `/api/channels/${channel.id}/read`,
      {
        method: "POST",
      },
    );

    history.replaceState(
      null,
      "",
      `?channel=${channel.id}`,
    );

    setData(
      (current) =>
        current && {
          ...current,

          channels: current.channels.map(
            (item) =>
              item.id === channel.id
                ? {
                    ...item,
                    unreadCount: 0,
                  }
                : item,
          ),
        },
    );
  };

  async function openMessage(
    channelId: string,
    messageId: string,
  ) {
    if (!data) return;

    const channel = [
      ...data.channels,
      ...data.conversations.map(
        (item) => item.channel,
      ),
    ].find((item) => item.id === channelId);

    if (!channel) return;

    setSelected(channel);
    setPanel(null);
    setThread(null);

    history.replaceState(
      null,
      "",
      `?channel=${channel.id}#message-${messageId}`,
    );

    const items = await loadMessages(channel);

    void api(
      `/api/channels/${channel.id}/read`,
      {
        method: "POST",
      },
    );

    setData(
      (current) =>
        current && {
          ...current,

          channels: current.channels.map(
            (item) =>
              item.id === channel.id
                ? {
                    ...item,
                    unreadCount: 0,
                  }
                : item,
          ),
        },
    );

    window.setTimeout(() => {
      const element = document.getElementById(
        `message-${messageId}`,
      );

      element?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      element?.classList.add(
        "message-highlight",
      );

      window.setTimeout(
        () =>
          element?.classList.remove(
            "message-highlight",
          ),
        1800,
      );
    }, 80);

    if (
      !items.some(
        (item) => item.id === messageId,
      )
    ) {
      setMessageError(
        "That message is inside a thread or is no longer available in the channel view.",
      );
    }
  }

  async function toggleMute() {
    if (!selected) return;

    try {
      const next = !notificationsMuted;

      await api(
        `/api/channels/${selected.id}/members`,
        {
          method: "PATCH",

          body: JSON.stringify({
            notificationsMuted: next,
          }),
        },
      );

      setNotificationsMuted(next);

      setMessageError(
        next
          ? "Channel notifications muted"
          : "Channel notifications unmuted",
      );

      window.setTimeout(
        () => setMessageError(""),
        1500,
      );
    } catch (reason) {
      setMessageError(
        reason instanceof Error
          ? reason.message
          : "Could not update notifications",
      );
    }
  }

  const updateDraft = (
    channelId: string,
    value: string,
  ) => {
    setDrafts((current) => {
      const next = {
        ...current,
        [channelId]: value,
      };

      if (!value) {
        delete next[channelId];
      }

      localStorage.setItem(
        "rundesk-drafts",
        JSON.stringify(next),
      );

      return next;
    });
  };

  async function saveChannel(input: {
    name: string;
    description: string;
    topic: string;
    isPrivate: boolean;
    memberIds: string[];
  }) {
    if (!data) return;

    const editing =
      channelModal !== "new" && channelModal;

    const channel = await api<Channel>(
      editing
        ? `/api/channels/${editing.id}`
        : "/api/channels",
      {
        method: editing ? "PATCH" : "POST",

        body: JSON.stringify(
          editing
            ? {
                name: input.name,
                description:
                  input.description,
                topic: input.topic,
                isPrivate:
                  input.isPrivate,
              }
            : {
                ...input,
                workspaceId:
                  data.workspace.id,
              },
        ),
      },
    );

    setData(
      (current) =>
        current && {
          ...current,

          channels: editing
            ? current.channels.map(
                (item) =>
                  item.id === channel.id
                    ? channel
                    : item,
              )
            : [
                ...current.channels,
                channel,
              ].sort((a, b) =>
                a.name.localeCompare(b.name),
              ),
        },
    );

    selectChannel(channel);
    setChannelModal(null);
  }

  async function deleteChannel(
    channel: Channel,
  ) {
    if (
      !confirm(
        `Delete #${channel.name}? Messages and related data will also be deleted.`,
      )
    ) {
      return;
    }

    try {
      await api<void>(
        `/api/channels/${channel.id}`,
        {
          method: "DELETE",
        },
      );

      const next =
        data?.channels.find(
          (item) =>
            item.id !== channel.id,
        ) ??
        data?.conversations[0]
          ?.channel ??
        null;

      setData(
        (current) =>
          current && {
            ...current,

            channels:
              current.channels.filter(
                (item) =>
                  item.id !== channel.id,
              ),
          },
      );

      if (selected?.id === channel.id) {
        setSelected(next);

        if (next) {
          void loadMessages(next);
        } else {
          setMessages([]);
          setChannelMembers([]);
        }
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Delete failed",
      );
    }
  }

  async function send(
    content: string,
    attachments: MessageAttachment[],
  ) {
    if (!selected || !data) {
      return false;
    }

    const tempId =
      `optimistic-${crypto.randomUUID()}`;

    const optimistic: Message = {
      id: tempId,
      channelId: selected.id,
      authorId: data.currentUser.id,
      content,
      parentMessageId: null,
      createdAt:
        new Date().toISOString(),
      updatedAt:
        new Date().toISOString(),
      editedAt: null,
      author: data.currentUser,
      reactions: [],
      attachments,
      _count: {
        replies: 0,
      },
      optimistic: true,
    };

    setMessages((current) => [
      ...current,
      optimistic,
    ]);

    setMessageError("");

    try {
      const saved = await api<Message>(
        `/api/channels/${selected.id}/messages`,
        {
          method: "POST",

          body: JSON.stringify({
            content,
            attachments,
          }),
        },
      );

      setMessages((current) =>
        current.map((item) =>
          item.id === tempId
            ? saved
            : item,
        ),
      );

      return true;
    } catch (reason) {
      setMessages((current) =>
        current.filter(
          (item) => item.id !== tempId,
        ),
      );

      setMessageError(
        reason instanceof Error
          ? `Failed to send message: ${reason.message}`
          : "Failed to send message. Try again.",
      );

      return false;
    }
  }

  async function react(
    message: Message,
    emoji: string,
  ) {
    try {
      const result = await api<{
        reactions: ApiReaction[];
      }>(
        `/api/messages/${message.id}/reactions`,
        {
          method: "POST",
          body: JSON.stringify({
            emoji,
          }),
        },
      );

      setMessages((current) =>
        current.map((item) =>
          item.id === message.id
            ? {
                ...item,
                reactions:
                  result.reactions,
              }
            : item,
        ),
      );
    } catch (reason) {
      setMessageError(
        reason instanceof Error
          ? reason.message
          : "Reaction failed",
      );
    }
  }

  async function editMessage(
    message: Message,
    content: string,
  ) {
    const next = content.trim();

    if (
      !next ||
      next === message.content
    ) {
      return true;
    }

    try {
      const updated = await api<Message>(
        `/api/messages/${message.id}`,
        {
          method: "PATCH",

          body: JSON.stringify({
            content: next,
          }),
        },
      );

      setMessages((current) =>
        current.map((item) =>
          item.id === message.id
            ? updated
            : item,
        ),
      );

      return true;
    } catch (reason) {
      setMessageError(
        reason instanceof Error
          ? reason.message
          : "Edit failed",
      );

      return false;
    }
  }

  async function deleteMessage(
    message: Message,
  ) {
    if (
      !confirm(
        "Delete this message? This cannot be undone.",
      )
    ) {
      return;
    }

    try {
      await api<void>(
        `/api/messages/${message.id}`,
        {
          method: "DELETE",
        },
      );

      setMessages((current) =>
        current.filter(
          (item) =>
            item.id !== message.id,
        ),
      );
    } catch (reason) {
      setMessageError(
        reason instanceof Error
          ? reason.message
          : "Delete failed",
      );
    }
  }

  async function assignMessageTo(
    message: Message,
    user: User,
  ) {
    await api(
      `/api/messages/${message.id}/assignment`,
      {
        method: "POST",

        body: JSON.stringify({
          assigneeId: user.id,
        }),
      },
    );

    setMessages((current) =>
      current.map((item) =>
        item.id === message.id
          ? {
              ...item,

              assignments: [
                ...(
                  item.assignments ?? []
                ).filter(
                  (assignment) =>
                    assignment.assigneeId !==
                    user.id,
                ),

                {
                  id: `optimistic-${user.id}`,
                  assigneeId: user.id,
                  resolvedAt: null,
                  assignee: user,
                },
              ],
            }
          : item,
      ),
    );

    setMessageError(
      `Assigned to ${user.name}`,
    );

    window.setTimeout(
      () => setMessageError(""),
      1800,
    );
  }

  async function markUnread(
    message: Message,
  ) {
    try {
      await api(
        `/api/channels/${message.channelId}/read`,
        {
          method: "PATCH",

          body: JSON.stringify({
            before: message.createdAt,
          }),
        },
      );

      setData(
        (current) =>
          current && {
            ...current,

            channels: current.channels.map(
              (channel) =>
                channel.id ===
                message.channelId
                  ? {
                      ...channel,

                      unreadCount:
                        Math.max(
                          1,
                          channel.unreadCount ??
                            0,
                        ),
                    }
                  : channel,
            ),
          },
      );

      setMessageError(
        "Marked unread from this message",
      );

      window.setTimeout(
        () => setMessageError(""),
        1600,
      );
    } catch (reason) {
      setMessageError(
        reason instanceof Error
          ? reason.message
          : "Could not mark unread",
      );
    }
  }

  async function createTask(input: {
    title: string;
    description: string;
    status: Task["status"];
    priority: Task["priority"];
    dueDate: string;
    assigneeIds: string[];
    sourceMessageId?: string;
  }) {
    if (!data) return false;

    try {
      const task = await api<Task>(
        "/api/tasks",
        {
          method: "POST",

          body: JSON.stringify({
            ...input,

            workspaceId:
              data.workspace.id,

            channelId:
              selected?.id,

            dueDate:
              input.dueDate || null,
          }),
        },
      );

      setData(
        (current) =>
          current && {
            ...current,

            tasks: [
              task,
              ...current.tasks,
            ],
          },
      );

      return true;
    } catch (reason) {
      setMessageError(
        reason instanceof Error
          ? reason.message
          : "Task creation failed",
      );

      return false;
    }
  }

  async function openTasks(
    view: "all" | "assigned" | "due",
  ) {
    if (!data) return;

    setPanel("tasks");

    setTaskViewTitle(
      view === "due"
        ? "Today & Overdue"
        : view === "assigned"
          ? "Assigned to me"
          : "My Tasks",
    );

    try {
      setPanelTasks(
        await api<Task[]>(
          `/api/tasks?workspaceId=${data.workspace.id}&view=${view}`,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Tasks failed to load",
      );
    }
  }

  async function changeStatus(
    task: Task,
    status: Task["status"],
  ) {
    const updated = await api<Task>(
      `/api/tasks/${task.id}`,
      {
        method: "PATCH",

        body: JSON.stringify({
          status,
        }),
      },
    );

    setPanelTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? updated
          : item,
      ),
    );

    setData(
      (current) =>
        current && {
          ...current,

          tasks: current.tasks.map(
            (item) =>
              item.id === task.id
                ? updated
                : item,
          ),
        },
    );
  }

  async function editTask(task: Task) {
    const title = prompt(
      "Edit task name",
      task.title,
    )?.trim();

    if (
      !title ||
      title === task.title
    ) {
      return;
    }

    try {
      const updated = await api<Task>(
        `/api/tasks/${task.id}`,
        {
          method: "PATCH",

          body: JSON.stringify({
            title,
          }),
        },
      );

      setPanelTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? updated
            : item,
        ),
      );

      setData(
        (current) =>
          current && {
            ...current,

            tasks: current.tasks.map(
              (item) =>
                item.id === task.id
                  ? updated
                  : item,
            ),
          },
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Task update failed",
      );
    }
  }

  async function deleteTask(task: Task) {
    if (
      !confirm(
        `Delete task “${task.title}”?`,
      )
    ) {
      return;
    }

    try {
      await api<void>(
        `/api/tasks/${task.id}`,
        {
          method: "DELETE",
        },
      );

      setPanelTasks((current) =>
        current.filter(
          (item) =>
            item.id !== task.id,
        ),
      );

      setData(
        (current) =>
          current && {
            ...current,

            tasks: current.tasks.filter(
              (item) =>
                item.id !== task.id,
            ),
          },
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Task deletion failed",
      );
    }
  }

  async function startDm(users: User[]) {
    if (!data) return;

    try {
      const conversation =
        await api<Conversation>(
          "/api/conversations",
          {
            method: "POST",

            body: JSON.stringify({
              workspaceId:
                data.workspace.id,

              userIds: users.map(
                (user) => user.id,
              ),
            }),
          },
        );

      setData(
        (current) =>
          current && {
            ...current,

            conversations:
              current.conversations.some(
                (item) =>
                  item.id ===
                  conversation.id,
              )
                ? current.conversations
                : [
                    conversation,
                    ...current.conversations,
                  ],
          },
      );

      selectChannel(
        conversation.channel,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not start conversation",
      );
    }
  }

  const displayChannel = useMemo(() => {
    if (
      !data ||
      !selected ||
      selected.type !== "DIRECT"
    ) {
      return selected;
    }

    const conversation =
      data.conversations.find(
        (item) =>
          item.channelId === selected.id,
      );

    if (!conversation) {
      return selected;
    }

    const others =
      conversation.members
        .filter(
          (item) =>
            item.userId !==
            data.currentUser.id,
        )
        .map(
          (item) =>
            item.user.name,
        );

    return {
      ...selected,

      name:
        others.join(", ") ||
        "Direct message",

      description:
        "Direct message",
    };
  }, [data, selected]);

  const activeTool =
    panel === "channel-search"
      ? "search"
      : panel === "members"
        ? "members"
        : panel === "replies"
          ? "replies"
          : panel === "assigned"
            ? "assigned"
            : panel === "details"
              ? "settings"
              : null;

  const togglePanel = (
    next: Exclude<
      Panel,
      "search" | "tasks" | "dm" | "inbox" | null
    >,
  ) =>
    setPanel((current) =>
      current === next
        ? null
        : next,
    );

  const layoutStyle = {
    "--chat-sidebar-width": `${chatLayout.width}px`,
  } as CSSProperties;

  if (loading) {
    return (
      <main className="boot-state">
        <LoaderCircle
          className="spin"
        />

        <span>
          Loading Rundesk…
        </span>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="boot-state database-state">
        <Database size={32} />

        <h1>
          Connect Rundesk to MySQL
        </h1>

        <p>{error}</p>

        <code>
          DATABASE_URL=&quot;mysql://USER:PASSWORD@localhost:3306/rundesk&quot;
        </code>

        <span>
          Then run the migration and seed
          commands from the setup guide.
        </span>
      </main>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <main
      className={[
        "rundesk-shell",
        chatLayout.collapsed ? "sidebar-collapsed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={layoutStyle}
    >
      <TopAppBar
        user={data.currentUser}
        role={data.currentRole}
        onSearch={() =>
          setPanel("search")
        }
        onNew={() =>
          setNewMenu(
            (current) => !current,
          )
        }
        onNotifications={() =>
          setPanel("inbox")
        }
        onAdmin={
          data.canManageWorkspace
            ? () => setPanel("admin")
            : undefined
        }
        onAi={() =>
          setMessageError(
            "Connect a Rundesk AI provider to enable AI Chats.",
          )
        }
      />

      <div className="sidebar-wrap">
        <Sidebar
          channels={data.channels}
          selectedId={
            selected?.id ?? ""
          }
          conversations={
            data.conversations
          }
          currentUserId={
            data.currentUser.id
          }
          drafts={drafts}
          onSelect={selectChannel}
          onCreateChannel={() =>
            setChannelModal("new")
          }
          onDetails={(channel) => {
            setSelected(channel);
            setPanel("details");
          }}
          onDeleteChannel={
            deleteChannel
          }
          onTaskView={openTasks}
          onDMs={() =>
            setPanel("dm")
          }
          onInbox={() =>
            setPanel("inbox")
          }
          onReplies={() =>
            setPanel("replies")
          }
          onAssigned={() =>
            setPanel("assigned")
          }
          onCollapse={
            chatLayout.toggle
          }
        />
      </div>

      <section className="chat-panel">
        <button
          className="sidebar-toggle"
          onClick={
            chatLayout.toggle
          }
          aria-label="Toggle chat sidebar"
        >
          {chatLayout.collapsed ? (
            <PanelLeftOpen
              size={17}
            />
          ) : (
            <PanelLeftClose
              size={17}
            />
          )}
        </button>

        {selected &&
        displayChannel ? (
          <>
            <ChatHeader
              key={selected.id}
              channel={
                displayChannel
              }
              currentUserId={
                data.currentUser.id
              }
              muted={
                notificationsMuted
              }
              onDetails={() =>
                setPanel("details")
              }
              onEdit={() =>
                setChannelModal(
                  selected,
                )
              }
              onDelete={() =>
                void deleteChannel(
                  selected,
                )
              }
              onToggleMute={() =>
                void toggleMute()
              }
              onSearch={() =>
                togglePanel(
                  "channel-search",
                )
              }
              onMembers={() =>
                togglePanel(
                  "members",
                )
              }
              onCall={() =>
                setMessageError(
                  "Calls need realtime audio/video infrastructure.",
                )
              }
            />

            <div
              className="message-scroll"
              ref={scrollRef}
            >
              <MessageList
                channel={
                  displayChannel
                }
                messages={
                  messages
                }
                currentUserId={
                  data.currentUser.id
                }
                loading={
                  messageLoading
                }
                error={
                  messageError
                }
                onReply={
                  setThread
                }
                onReact={
                  react
                }
                onEdit={
                  editMessage
                }
                onDelete={
                  deleteMessage
                }
                onTask={(
                  message,
                ) =>
                  setTaskDraft({
                    sourceMessageId:
                      message.id,

                    content:
                      message.content,
                  })
                }
                onAssign={(
                  message,
                ) =>
                  setAssignmentTarget(
                    message,
                  )
                }
                onMarkUnread={(
                  message,
                ) =>
                  void markUnread(
                    message,
                  )
                }
              />
            </div>

            <Composer
              key={`${selected.id}-${taskDraft?.sourceMessageId ?? "composer"}`}
              channelName={
                displayChannel.name
              }
              users={data.users}
              currentUser={
                data.currentUser
              }
              tasks={data.tasks}
              taskDraft={
                taskDraft
              }
              initialValue={
                drafts[selected.id] ??
                ""
              }
              onDraftChange={(
                value,
              ) =>
                updateDraft(
                  selected.id,
                  value,
                )
              }
              onSend={send}
              onCreateTask={
                createTask
              }
            />
          </>
        ) : (
          <div className="center-state">
            Create a channel to
            start chatting.
          </div>
        )}
      </section>

      <RightRail
        users={
          channelMembers.length
            ? channelMembers
            : data.users
        }
        active={activeTool}
        unreadReplies={messages.reduce(
          (sum, item) =>
            sum +
            item._count.replies,
          0,
        )}
        onSearch={() =>
          togglePanel(
            "channel-search",
          )
        }
        onReplies={() =>
          togglePanel("replies")
        }
        onAssigned={() =>
          togglePanel("assigned")
        }
        onMembers={() =>
          togglePanel("members")
        }
        onSettings={() =>
          togglePanel("details")
        }
      />
      {!chatLayout.collapsed && (
        <div
          className="panel-resizer chat-resizer"
          onPointerDown={
            chatLayout.onPointerDown
          }
          onDoubleClick={
            chatLayout.reset
          }
          title="Drag to resize. Double-click to reset."
        />
      )}

      {newMenu && (
        <NewMenu
          onClose={() =>
            setNewMenu(false)
          }
          onTask={() => {
            setNewMenu(false);
            void openTasks("all");
          }}
          onChannel={() => {
            setNewMenu(false);
            setChannelModal("new");
          }}
          onDm={() => {
            setNewMenu(false);
            setPanel("dm");
          }}
        />
      )}

      {assignmentTarget && (
        <AssignMessagePanel
          message={
            assignmentTarget
          }
          users={data.users}
          onClose={() =>
            setAssignmentTarget(
              null,
            )
          }
          onAssign={(user) =>
            assignMessageTo(
              assignmentTarget,
              user,
            )
          }
        />
      )}

      {thread && (
        <ThreadPanel
          key={thread.id}
          message={thread}
          currentUser={
            data.currentUser
          }
          onClose={() =>
            setThread(null)
          }
          onReplyAdded={() =>
            setMessages(
              (current) =>
                current.map(
                  (item) =>
                    item.id ===
                    thread.id
                      ? {
                          ...item,

                          _count: {
                            replies:
                              item
                                ._count
                                .replies +
                              1,
                          },
                        }
                      : item,
                ),
            )
          }
        />
      )}

      {panel === "search" && (
        <SearchPanel
          workspaceId={
            data.workspace.id
          }
          onClose={() =>
            setPanel(null)
          }
          onOpenChannel={(
            channelId,
          ) => {
            const channel = [
              ...data.channels,

              ...data.conversations.map(
                (item) =>
                  item.channel,
              ),
            ].find(
              (item) =>
                item.id ===
                channelId,
            );

            if (channel) {
              selectChannel(
                channel,
              );
            }
          }}
          onOpenMessage={(
            channelId,
            messageId,
          ) =>
            void openMessage(
              channelId,
              messageId,
            )
          }
        />
      )}

      {panel ===
        "channel-search" &&
        selected && (
          <SearchPanel
            workspaceId={
              data.workspace.id
            }
            channelId={
              selected.id
            }
            channelName={
              displayChannel?.name
            }
            onClose={() =>
              setPanel(null)
            }
            onOpenMessage={(
              channelId,
              messageId,
            ) =>
              void openMessage(
                channelId,
                messageId,
              )
            }
          />
        )}

      {panel === "members" &&
        selected && (
          <MembersPanel
            channel={selected}
            allUsers={
              data.users
            }
            currentUserId={
              data.currentUser.id
            }
            currentRole={
              data.currentRole
            }
            onClose={() =>
              setPanel(null)
            }
            onMembershipChange={
              setChannelMembers
            }
          />
        )}

      {panel === "inbox" && (
        <ActivityPanel
          mode="inbox"
          currentUserId={
            data.currentUser.id
          }
          onClose={() =>
            setPanel(null)
          }
          onOpenMessage={(
            channelId,
            messageId,
          ) =>
            void openMessage(
              channelId,
              messageId,
            )
          }
        />
      )}

      {panel === "replies" && (
        <ActivityPanel
          mode="replies"
          currentUserId={
            data.currentUser.id
          }
          onClose={() =>
            setPanel(null)
          }
          onOpenMessage={(
            channelId,
            messageId,
          ) =>
            void openMessage(
              channelId,
              messageId,
            )
          }
        />
      )}

      {panel === "assigned" && (
        <ActivityPanel
          mode="assigned"
          currentUserId={
            data.currentUser.id
          }
          onClose={() =>
            setPanel(null)
          }
          onOpenMessage={(
            channelId,
            messageId,
          ) =>
            void openMessage(
              channelId,
              messageId,
            )
          }
        />
      )}

      {panel === "tasks" && (
        <TasksPanel
          title={taskViewTitle}
          tasks={panelTasks}
          onClose={() =>
            setPanel(null)
          }
          onStatus={(
            task,
            status,
          ) =>
            void changeStatus(
              task,
              status,
            )
          }
          onEdit={(task) =>
            void editTask(task)
          }
          onDelete={(task) =>
            void deleteTask(task)
          }
        />
      )}

      {panel === "details" &&
        selected && (
          <ChannelDetailsPanel
            channel={selected}
            users={
              channelMembers.length
                ? channelMembers
                : data.users
            }
            muted={
              notificationsMuted
            }
            onClose={() =>
              setPanel(null)
            }
            onEdit={() =>
              setChannelModal(
                selected,
              )
            }
            onMembers={() =>
              setPanel("members")
            }
            onToggleMute={() =>
              void toggleMute()
            }
          />
        )}

      {channelModal && (
        <ChannelModal
          channel={
            channelModal === "new"
              ? undefined
              : channelModal
          }
          users={data.users}
          onClose={() =>
            setChannelModal(null)
          }
          onSave={saveChannel}
        />
      )}

      {panel === "admin" &&
        data.canManageWorkspace && (
          <AdminMembersPanel
            workspaceId={
              data.workspace.id
            }
            currentUserId={
              data.currentUser.id
            }
            currentRole={
              data.currentRole
            }
            onClose={() =>
              setPanel(null)
            }
            onChanged={async () => {
              const fresh =
                await api<BootstrapData>(
                  "/api/bootstrap",
                );

              setData(fresh);
            }}
          />
        )}

      {panel === "dm" && (
        <DmModal
          users={data.users}
          currentUserId={
            data.currentUser.id
          }
          onClose={() =>
            setPanel(null)
          }
          onSelect={(users) =>
            void startDm(users)
          }
        />
      )}
    </main>
  );
}
