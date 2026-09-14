"use client";

import {
  AtSign,
  Bell,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  CircleX,
  Hash,
  Inbox,
  Link2,
  ListFilter,
  LockKeyhole,
  Mail,
  PanelLeft,
  Send,
  MessageSquareReply,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Star,
  UserMinus,
  UserRoundCheck,
  Users,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createPortal } from "react-dom";

import { api } from "@/lib/rundesk/api";

import type {
  Channel,
  Conversation,
} from "@/lib/rundesk/types";

interface Props {
  channels: Channel[];
  selectedId: string;
  conversations: Conversation[];
  currentUserId: string;
  drafts: Record<string, string>;

  onSelect: (channel: Channel) => void;
  onCreateChannel: () => void;
  onDetails: (channel: Channel) => void;
  onDeleteChannel: (channel: Channel) => void;

  onTaskView: (
    view: "all" | "assigned" | "due",
  ) => void;

  onDMs: () => void;
  onInbox: () => void;
  onReplies: () => void;
  onAssigned: () => void;
  onCollapse: () => void;
}

const FAVORITES_KEY =
  "rundesk:sidebar-favorites";

const CLOSED_DMS_KEY =
  "rundesk:closed-dms";

const SIDEBAR_FILTERS_KEY =
  "rundesk:sidebar-show-filters";

function getConversationName(
  conversation: Conversation,
  currentUserId: string,
) {
  const others =
    conversation.members.filter(
      (member) =>
        member.userId !== currentUserId,
    );

  return (
    conversation.channel.topic?.trim() ||
    others
      .map(
        (member) =>
          member.user.name,
      )
      .filter(Boolean)
      .join(", ") ||
    "Direct message"
  );
}

function initials(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return "DM";
  }

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${words[0][0] ?? ""}${
    words[1][0] ?? ""
  }`.toUpperCase();
}

function readStoredSet(
  key: string,
) {
  if (
    typeof window === "undefined"
  ) {
    return new Set<string>();
  }

  try {
    const value =
      localStorage.getItem(key);

    if (!value) {
      return new Set<string>();
    }

    const parsed =
      JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set<string>(
      parsed.filter(
        (item): item is string =>
          typeof item === "string",
      ),
    );
  } catch {
    return new Set<string>();
  }
}

function saveStoredSet(
  key: string,
  value: Set<string>,
) {
  localStorage.setItem(
    key,
    JSON.stringify([...value]),
  );
}

export default function Sidebar({
  channels,
  selectedId,
  conversations,
  currentUserId,
  drafts,

  onSelect,
  onCreateChannel,
  onDetails,

  onDMs,
  onInbox,
  onReplies,
  onAssigned,
  onCollapse,
}: Props) {
  const [
    openMenu,
    setOpenMenu,
  ] = useState<string | null>(
    null,
  );

  const [
    sidebarSearchOpen,
    setSidebarSearchOpen,
  ] = useState(false);

  const [
    sidebarSearch,
    setSidebarSearch,
  ] = useState("");

  const [
    filtersVisible,
    setFiltersVisible,
  ] = useState(true);

  const [
    favorites,
    setFavorites,
  ] = useState<Set<string>>(
    new Set(),
  );

  const [
    closedDms,
    setClosedDms,
  ] = useState<Set<string>>(
    new Set(),
  );

  const [
    manuallyUnread,
    setManuallyUnread,
  ] = useState<Set<string>>(
    new Set(),
  );

  const menuRef =
    useRef<HTMLDivElement>(null);

  const [
    floatingMenuPosition,
    setFloatingMenuPosition,
  ] = useState<{
    top: number;
    left: number;
  } | null>(null);

  function toggleFloatingRowMenu(
    menuKey: string,
    trigger: HTMLButtonElement,
    estimatedHeight: number,
  ) {
    if (openMenu === menuKey) {
      setOpenMenu(null);
      setFloatingMenuPosition(null);
      return;
    }

    const rect =
      trigger.getBoundingClientRect();

    const menuWidth = 320;
    const gap = 8;
    const viewportPadding = 12;

    let left = rect.right + gap;

    if (
      left + menuWidth >
      window.innerWidth - viewportPadding
    ) {
      left = Math.max(
        viewportPadding,
        rect.left - menuWidth - gap,
      );
    }

    let top = Math.max(
      viewportPadding,
      rect.top - 8,
    );

    if (
      top + estimatedHeight >
      window.innerHeight - viewportPadding
    ) {
      top = Math.max(
        viewportPadding,
        window.innerHeight -
          estimatedHeight -
          viewportPadding,
      );
    }

    setFloatingMenuPosition({
      top,
      left,
    });

    setOpenMenu(menuKey);
  }

  useEffect(() => {
    setFavorites(
      readStoredSet(
        FAVORITES_KEY,
      ),
    );

    setClosedDms(
      readStoredSet(
        CLOSED_DMS_KEY,
      ),
    );

    const storedFilters =
      localStorage.getItem(
        SIDEBAR_FILTERS_KEY,
      );

    if (storedFilters === "false") {
      setFiltersVisible(false);
    }
  }, []);

  /*
   * Close the open sidebar menu when
   * clicking anywhere else.
   */
  useEffect(() => {
    const outside = (
      event: MouseEvent,
    ) => {
      if (
        openMenu &&
        menuRef.current &&
        !menuRef.current.contains(
          event.target as Node,
        )
      ) {
        setOpenMenu(null);
        setFloatingMenuPosition(null);
      }
    };

    const escape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        setFloatingMenuPosition(null);
      }
    };

    document.addEventListener(
      "mousedown",
      outside,
    );

    document.addEventListener(
      "keydown",
      escape,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        outside,
      );

      document.removeEventListener(
        "keydown",
        escape,
      );
    };
  }, [openMenu]);

  /*
   * Match the ClickUp sidebar shortcut shown
   * in the tooltip: Ctrl + \ closes the sidebar.
   */
  useEffect(() => {
    const shortcut = (
      event: KeyboardEvent,
    ) => {
      if (
        (event.ctrlKey ||
          event.metaKey) &&
        event.key === "\\"
      ) {
        event.preventDefault();
        onCollapse();
        return;
      }

      if (
        (event.ctrlKey ||
          event.metaKey) &&
        event.key.toLowerCase() === "g"
      ) {
        event.preventDefault();
        setOpenMenu(null);
        onDMs();
      }
    };

    document.addEventListener(
      "keydown",
      shortcut,
    );

    return () =>
      document.removeEventListener(
        "keydown",
        shortcut,
      );
  }, [onCollapse, onDMs]);

  /*
   * ClickUp-like behavior:
   *
   * If a DM was closed but later receives
   * unread messages, show it again.
   */
  useEffect(() => {
    const reopened =
      conversations.filter(
        (conversation) =>
          closedDms.has(
            conversation.id,
          ) &&
          (conversation.channel
            .unreadCount ?? 0) > 0,
      );

    if (!reopened.length) {
      return;
    }

    setClosedDms((current) => {
      const next =
        new Set(current);

      reopened.forEach(
        (conversation) =>
          next.delete(
            conversation.id,
          ),
      );

      saveStoredSet(
        CLOSED_DMS_KEY,
        next,
      );

      return next;
    });
  }, [
    conversations,
    closedDms,
  ]);

  const visibleConversations =
    useMemo(
      () =>
        conversations.filter(
          (conversation) =>
            !closedDms.has(
              conversation.id,
            ) ||
            (conversation.channel
              .unreadCount ?? 0) > 0,
        ),
      [
        conversations,
        closedDms,
      ],
    );

  const normalizedSidebarSearch =
    sidebarSearch
      .trim()
      .toLowerCase();

  const filteredChannels =
    useMemo(() => {
      if (!normalizedSidebarSearch) {
        return channels;
      }

      return channels.filter(
        (channel) =>
          channel.name
            .toLowerCase()
            .includes(
              normalizedSidebarSearch,
            ) ||
          (
            channel.description ??
            ""
          )
            .toLowerCase()
            .includes(
              normalizedSidebarSearch,
            ),
      );
    }, [
      channels,
      normalizedSidebarSearch,
    ]);

  const filteredConversations =
    useMemo(() => {
      if (!normalizedSidebarSearch) {
        return visibleConversations;
      }

      return visibleConversations.filter(
        (conversation) =>
          getConversationName(
            conversation,
            currentUserId,
          )
            .toLowerCase()
            .includes(
              normalizedSidebarSearch,
            ),
      );
    }, [
      visibleConversations,
      currentUserId,
      normalizedSidebarSearch,
    ]);

  function toggleSidebarSearch() {
    setOpenMenu(null);

    if (sidebarSearchOpen) {
      setSidebarSearch("");
      setSidebarSearchOpen(false);
      return;
    }

    setSidebarSearchOpen(true);
  }

  function toggleFilters() {
    setFiltersVisible((current) => {
      const next = !current;

      localStorage.setItem(
        SIDEBAR_FILTERS_KEY,
        String(next),
      );

      return next;
    });

    setOpenMenu(null);
  }

  function toggleFavorite(
    key: string,
  ) {
    setFavorites((current) => {
      const next =
        new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      saveStoredSet(
        FAVORITES_KEY,
        next,
      );

      return next;
    });

    setOpenMenu(null);
  }

  function closeDm(
    conversationId: string,
  ) {
    setClosedDms((current) => {
      const next =
        new Set(current);

      next.add(
        conversationId,
      );

      saveStoredSet(
        CLOSED_DMS_KEY,
        next,
      );

      return next;
    });

    setOpenMenu(null);
  }

  function selectChannel(
    channel: Channel,
  ) {
    setManuallyUnread(
      (current) => {
        if (
          !current.has(
            channel.id,
          )
        ) {
          return current;
        }

        const next =
          new Set(current);

        next.delete(
          channel.id,
        );

        return next;
      },
    );

    setOpenMenu(null);

    onSelect(channel);
  }

  async function copyLink(
    channel: Channel,
  ) {
    const url =
      new URL(location.href);

    url.searchParams.set(
      "channel",
      channel.id,
    );

    url.hash = "";

    try {
      await navigator.clipboard.writeText(
        url.toString(),
      );
    } catch {
      // Clipboard unavailable.
    }

    setOpenMenu(null);
  }

  /*
   * Existing Rundesk "mark unread"
   * API expects a message timestamp.
   *
   * So from the sidebar we first
   * fetch the messages and use the
   * latest message timestamp.
   */
  async function markUnread(
    channel: Channel,
  ) {
    try {
      const messages =
        await api<
          Array<{
            createdAt: string;
          }>
        >(
          `/api/channels/${channel.id}/messages`,
        );

      const latest =
        messages[
          messages.length - 1
        ];

      if (latest) {
        await api(
          `/api/channels/${channel.id}/read`,
          {
            method: "PATCH",

            body:
              JSON.stringify({
                before:
                  latest.createdAt,
              }),
          },
        );
      }

      setManuallyUnread(
        (current) => {
          const next =
            new Set(current);

          next.add(channel.id);

          return next;
        },
      );
    } catch {
      // Keep the menu stable if
      // the request fails.
    }

    setOpenMenu(null);
  }

  function openSettings(
    channel: Channel,
  ) {
    setOpenMenu(null);

    onDetails(channel);
  }

  function isFavorite(
    key: string,
  ) {
    return favorites.has(key);
  }

  return (
    <aside
      className="sidebar"
      aria-label="Chat navigation"
    >
      <header
        className={[
          "chat-sidebar-head",
          "clickup-sidebar-head",
          sidebarSearchOpen
            ? "search-open"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="chat-sidebar-title">
          <strong>
            Chat
          </strong>
        </div>

        <div className="chat-sidebar-head-tools">
          <div className="chat-sidebar-hover-actions">
            <button
              type="button"
              className={
                sidebarSearchOpen
                  ? "active"
                  : ""
              }
              onClick={
                toggleSidebarSearch
              }
              aria-label="Search your sidebar"
              data-tooltip="Search your sidebar"
            >
              <Search size={16} />
            </button>

            <button
              type="button"
              className={
                filtersVisible
                  ? "active"
                  : ""
              }
              onClick={toggleFilters}
              aria-label={
                filtersVisible
                  ? "Hide filters"
                  : "Show filters"
              }
              data-tooltip={
                filtersVisible
                  ? "Hide filters"
                  : "Show filters"
              }
            >
              <ListFilter size={16} />
            </button>

            <button
              type="button"
              onClick={onCollapse}
              aria-label="Close sidebar"
              data-tooltip={"Close sidebar · Ctrl + \\"}
            >
              <ChevronsLeft
                size={16}
              />
            </button>
          </div>

          <div
            className="sidebar-create-anchor"
            ref={
              openMenu ===
              "sidebar:create"
                ? menuRef
                : undefined
            }
          >
            <button
              type="button"
              className="sidebar-create-button"
              onClick={() =>
                setOpenMenu(
                  openMenu ===
                    "sidebar:create"
                    ? null
                    : "sidebar:create",
                )
              }
              aria-label="Create"
              aria-expanded={
                openMenu ===
                "sidebar:create"
              }
              title="Create"
            >
              <Plus size={17} />

              <ChevronDown
                size={13}
              />
            </button>

            {openMenu ===
              "sidebar:create" && (
              <div
                className="sidebar-create-menu"
                role="menu"
              >
                <div className="sidebar-create-label">
                  Create
                </div>

                <button
                  type="button"
                  className="sidebar-create-item sidebar-create-message"
                  onClick={() => {
                    setOpenMenu(null);
                    onDMs();
                  }}
                >
                  <Send size={18} />

                  <span className="sidebar-create-copy">
                    <strong>Message</strong>
                  </span>

                  <kbd>Ctrl G</kbd>
                </button>

                <button
                  type="button"
                  className="sidebar-create-item sidebar-create-channel"
                  onClick={() => {
                    setOpenMenu(null);
                    onCreateChannel();
                  }}
                >
                  <Hash size={18} />

                  <span className="sidebar-create-copy">
                    <strong>Channel</strong>
                    <small>Conversations on specific topics</small>
                  </span>
                </button>

                <div className="sidebar-menu-separator" />

                <button
                  type="button"
                  className="sidebar-create-item sidebar-customize-item"
                  onClick={toggleFilters}
                >
                  <PanelLeft size={18} />

                  <span className="sidebar-create-copy">
                    <strong>Customize your sidebar</strong>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {sidebarSearchOpen && (
        <div className="sidebar-inline-search">
          <Search size={15} />

          <input
            autoFocus
            value={sidebarSearch}
            onChange={(event) =>
              setSidebarSearch(
                event.target.value,
              )
            }
            placeholder="Search channels and DMs"
            aria-label="Search channels and direct messages"
          />

          {sidebarSearch && (
            <button
              type="button"
              onClick={() =>
                setSidebarSearch("")
              }
              aria-label="Clear sidebar search"
              title="Clear search"
            >
              <CircleX size={15} />
            </button>
          )}
        </div>
      )}

      <div className="sidebar-scroll">
        {filtersVisible && (
          <div className="quick-pills">
            <button
              type="button"
              onClick={onInbox}
            >
              <AtSign size={13} />
              <span>
                Unread
              </span>
            </button>

            <button
              type="button"
              onClick={onDMs}
            >
              <Users size={13} />
              <span>
                DMs
              </span>
            </button>
          </div>
        )}

        <nav
          className="sidebar-section"
          aria-label="Chat views"
        >
          <button
            type="button"
            onClick={onInbox}
          >
            <Inbox size={16} />

            <span>
              Inbox
            </span>
          </button>

          <button
            type="button"
            onClick={onReplies}
          >
            <MessageSquareReply
              size={16}
            />

            <span>
              Replies
            </span>
          </button>

          <button
            type="button"
            onClick={
              onAssigned
            }
          >
            <UserRoundCheck
              size={16}
            />

            <span>
              Assigned Messages
            </span>
          </button>
        </nav>

        <div className="sidebar-divider" />

        {/* =============================
            CHANNELS
            ============================= */}

        <section className="sidebar-group channels-group">
          <h3>
            <span>
              Channels
            </span>

            <button
              type="button"
              onClick={
                onCreateChannel
              }
              aria-label="Create channel"
              title="Create channel"
            >
              <Plus size={15} />
            </button>
          </h3>

          <div className="sidebar-channel-list">
            {filteredChannels.length ===
            0 ? (
              <div className="sidebar-empty">
                {normalizedSidebarSearch
                  ? "No matching channels"
                  : "No channels yet"}
              </div>
            ) : (
              filteredChannels.map(
                (channel) => {
                  const selected =
                    channel.id ===
                    selectedId;

                  const hasDraft =
                    Boolean(
                      drafts[
                        channel.id
                      ],
                    );

                  const unread =
                    Math.max(
                      channel.unreadCount ??
                        0,

                      manuallyUnread.has(
                        channel.id,
                      )
                        ? 1
                        : 0,
                    );

                  const menuKey =
                    `channel:${channel.id}`;

                  const favoriteKey =
                    `channel:${channel.id}`;

                  const menuOpen =
                    openMenu ===
                    menuKey;

                  return (
                    <div
                      key={
                        channel.id
                      }
                      className={[
                        "channel-row",
                        "sidebar-menu-row",

                        selected
                          ? "active"
                          : "",

                        unread
                          ? "unread"
                          : "",

                        menuOpen
                          ? "menu-open"
                          : "",
                      ]
                        .filter(
                          Boolean,
                        )
                        .join(" ")}
                    >
                      <button
                        type="button"
                        className="channel-select"
                        onClick={() =>
                          selectChannel(
                            channel,
                          )
                        }
                        title={
                          channel.name
                        }
                      >
                        {channel.isPrivate ? (
                          <LockKeyhole
                            size={13}
                          />
                        ) : (
                          <Hash
                            size={14}
                          />
                        )}

                        <span>
                          {
                            channel.name
                          }
                        </span>

                        {hasDraft && (
                          <em>
                            Draft
                          </em>
                        )}

                        {unread >
                          0 && (
                          <b>
                            {unread >
                            99
                              ? "99+"
                              : unread}
                          </b>
                        )}
                      </button>

                      <div className="sidebar-row-menu-anchor">
                        <button
                          type="button"
                          className="channel-more sidebar-row-more"
                          onClick={(
                            event,
                          ) => {
                            event.stopPropagation();

                            toggleFloatingRowMenu(
                              menuKey,
                              event.currentTarget,
                              390,
                            );
                          }}
                          aria-label={`Options for ${channel.name}`}
                          aria-expanded={menuOpen}
                          title="Channel options"
                        >
                          <MoreHorizontal
                            size={15}
                          />
                        </button>

                        {menuOpen &&
                          floatingMenuPosition &&
                          typeof document !==
                            "undefined" &&
                          createPortal(
                            <div
                              ref={
                                menuRef
                              }
                              className="sidebar-item-menu channel-sidebar-menu sidebar-item-menu-portal"
                              role="menu"
                              style={{
                                top: floatingMenuPosition.top,
                                left: floatingMenuPosition.left,
                              }}
                            >
                            <button
                              type="button"
                              onClick={() =>
                                void markUnread(
                                  channel,
                                )
                              }
                            >
                              <Mail
                                size={
                                  16
                                }
                              />

                              <span>
                                Mark as unread
                              </span>

                              <kbd>
                                U
                              </kbd>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void copyLink(
                                  channel,
                                )
                              }
                            >
                              <Link2
                                size={
                                  16
                                }
                              />

                              <span>
                                Copy link
                              </span>

                              <kbd>
                                C
                              </kbd>
                            </button>

                            <div className="sidebar-menu-separator" />

                            <button
                              type="button"
                              onClick={() =>
                                toggleFavorite(
                                  favoriteKey,
                                )
                              }
                            >
                              <Star
                                size={
                                  16
                                }
                                fill={
                                  isFavorite(
                                    favoriteKey,
                                  )
                                    ? "currentColor"
                                    : "none"
                                }
                              />

                              <span>
                                {isFavorite(
                                  favoriteKey,
                                )
                                  ? "Remove favorite"
                                  : "Favorite"}
                              </span>

                              <ChevronRight
                                size={
                                  15
                                }
                              />
                            </button>

                            <div className="sidebar-menu-separator" />

                            <button
                              type="button"
                              disabled
                              title="Requires a configured channel email address"
                            >
                              <AtSign
                                size={
                                  16
                                }
                              />

                              <span>
                                Email to Channel
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                openSettings(
                                  channel,
                                )
                              }
                            >
                              <Bell
                                size={
                                  16
                                }
                              />

                              <span>
                                Notification settings
                              </span>
                            </button>

                            <button
                              type="button"
                              disabled
                              title="Channel follow/unfollow backend is not configured yet"
                            >
                              <UserMinus
                                size={
                                  16
                                }
                              />

                              <span>
                                Unfollow
                              </span>
                            </button>

                            <div className="sidebar-menu-separator" />

                            <button
                              type="button"
                              onClick={() =>
                                openSettings(
                                  channel,
                                )
                              }
                            >
                              <ShieldCheck
                                size={
                                  16
                                }
                              />

                              <span>
                                Sharing &amp;
                                Permissions
                              </span>
                            </button>
                            </div>,
                            document.body,
                          )}
                      </div>
                    </div>
                  );
                },
              )
            )}
          </div>
        </section>

        {/* =============================
            DIRECT MESSAGES
            ============================= */}

        <section className="sidebar-group dm-group">
          <h3 className="dm-section-heading">
            <span>
              Direct messages
            </span>

            <button
              type="button"
              className="dm-add-button"
              onClick={onDMs}
              aria-label="New direct message"
              title="New direct message"
            >
              <Plus size={15} />
            </button>
          </h3>

          <div className="sidebar-dm-list">
            {filteredConversations.length ===
            0 ? (
              <div className="sidebar-empty">
                {normalizedSidebarSearch
                  ? "No matching direct messages"
                  : "No direct messages yet"}
              </div>
            ) : (
              filteredConversations.map(
                (
                  conversation,
                ) => {
                  const name =
                    getConversationName(
                      conversation,
                      currentUserId,
                    );

                  const active =
                    conversation.channelId ===
                    selectedId;

                  const hasDraft =
                    Boolean(
                      drafts[
                        conversation
                          .channelId
                      ],
                    );

                  const unread =
                    Math.max(
                      conversation
                        .channel
                        .unreadCount ??
                        0,

                      manuallyUnread.has(
                        conversation
                          .channelId,
                      )
                        ? 1
                        : 0,
                    );

                  const menuKey =
                    `dm:${conversation.id}`;

                  const favoriteKey =
                    `dm:${conversation.id}`;

                  const menuOpen =
                    openMenu ===
                    menuKey;

                  return (
                    <div
                      key={
                        conversation.id
                      }
                      className={[
                        "dm-row-wrap",
                        "sidebar-menu-row",

                        active
                          ? "active"
                          : "",

                        unread
                          ? "unread"
                          : "",

                        menuOpen
                          ? "menu-open"
                          : "",
                      ]
                        .filter(
                          Boolean,
                        )
                        .join(" ")}
                    >
                      <button
                        type="button"
                        className="dm-row"
                        onClick={() =>
                          selectChannel(
                            conversation.channel,
                          )
                        }
                        title={
                          name
                        }
                      >
                        <span className="mini-avatar">
                          {initials(
                            name,
                          )}
                        </span>

                        <span className="dm-name">
                          {name}
                        </span>

                        {hasDraft && (
                          <em>
                            Draft
                          </em>
                        )}

                        {unread >
                          0 && (
                          <b className="dm-unread-count">
                            {unread >
                            99
                              ? "99+"
                              : unread}
                          </b>
                        )}
                      </button>

                      <div className="sidebar-row-menu-anchor">
                        <button
                          type="button"
                          className="dm-more sidebar-row-more"
                          onClick={(
                            event,
                          ) => {
                            event.stopPropagation();

                            toggleFloatingRowMenu(
                              menuKey,
                              event.currentTarget,
                              235,
                            );
                          }}
                          aria-label={`Options for ${name}`}
                          aria-expanded={menuOpen}
                          title="Direct message options"
                        >
                          <MoreHorizontal
                            size={15}
                          />
                        </button>

                        {menuOpen &&
                          floatingMenuPosition &&
                          typeof document !==
                            "undefined" &&
                          createPortal(
                            <div
                              ref={
                                menuRef
                              }
                              className="sidebar-item-menu dm-sidebar-menu sidebar-item-menu-portal"
                              role="menu"
                              style={{
                                top: floatingMenuPosition.top,
                                left: floatingMenuPosition.left,
                              }}
                            >
                            <button
                              type="button"
                              onClick={() =>
                                void markUnread(
                                  conversation.channel,
                                )
                              }
                            >
                              <Mail
                                size={
                                  16
                                }
                              />

                              <span>
                                Mark as unread
                              </span>

                              <kbd>
                                U
                              </kbd>
                            </button>

                            <div className="sidebar-menu-separator" />

                            <button
                              type="button"
                              onClick={() =>
                                toggleFavorite(
                                  favoriteKey,
                                )
                              }
                            >
                              <Star
                                size={
                                  16
                                }
                                fill={
                                  isFavorite(
                                    favoriteKey,
                                  )
                                    ? "currentColor"
                                    : "none"
                                }
                              />

                              <span>
                                {isFavorite(
                                  favoriteKey,
                                )
                                  ? "Remove favorite"
                                  : "Favorite"}
                              </span>

                              <ChevronRight
                                size={
                                  15
                                }
                              />
                            </button>

                            <div className="sidebar-menu-separator" />

                            <button
                              type="button"
                              className="sidebar-close-dm"
                              onClick={() =>
                                closeDm(
                                  conversation.id,
                                )
                              }
                            >
                              <CircleX
                                size={
                                  16
                                }
                              />

                              <span>
                                <strong>
                                  Close DM
                                </strong>

                                <small>
                                  Will reappear
                                  with new
                                  messages
                                </small>
                              </span>
                            </button>
                            </div>,
                            document.body,
                          )}
                      </div>
                    </div>
                  );
                },
              )
            )}

            <button
              type="button"
              className="more-row dm-new-message-row"
              onClick={onDMs}
            >
              <ChevronRight
                size={14}
              />

              <span>
                New message
              </span>
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}