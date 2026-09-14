"use client";

import {
  Bell,
  BellOff,
  ChevronRight,
  Clipboard,
  ClipboardPlus,
  Clock3,
  Edit3,
  Ellipsis,
  GitBranch,
  Link2,
  MessageCircleReply,
  Quote,
  Share2,
  SmilePlus,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import {
  useRef,
  useState,
} from "react";

import { api } from "@/lib/rundesk/api";

import EmojiGlyph, {
  applySkinTone,
  useEmojiSkinTone,
} from "./EmojiGlyph";
import ReactionPicker from "./ReactionPicker";

interface Props {
  own: boolean;
  messageId: string;

  onReply: () => void;
  onReact: (
    emoji: string,
  ) => void;

  onEdit?: () => void;
  onDelete?: () => void;

  onTask?: () => void;
  onAssign?: () => void;

  onCopy: () => void;
  onCopyLink: () => void;
  onMarkUnread: () => void;

  onQuote: () => void;

  onRemind: (
    when:
      | "1h"
      | "later-today"
      | "tomorrow"
      | "next-week",
  ) => void;

  followMessageId?: string;
}

export default function MessageHoverActions({
  own,
  messageId,

  onReply,
  onReact,

  onEdit,
  onDelete,

  onTask,
  onAssign,

  onCopy,
  onCopyLink,
  onMarkUnread,

  onQuote,
  onRemind,

  followMessageId,
}: Props) {
  const [
    reactionsOpen,
    setReactionsOpen,
  ] = useState(false);

  const [
    activeSubmenu,
    setActiveSubmenu,
  ] = useState<
    "remind" | "relationship" | null
  >(null);

  const [
    following,
    setFollowing,
  ] = useState(false);

  const [
    followLoaded,
    setFollowLoaded,
  ] = useState(false);

  const [
    followBusy,
    setFollowBusy,
  ] = useState(false);

  const [
    skinTone,
  ] = useEmojiSkinTone();

  const detailsRef =
    useRef<HTMLDetailsElement>(
      null,
    );

  const threadId =
    followMessageId ??
    messageId;

  function closeMenu() {
    if (
      detailsRef.current
    ) {
      detailsRef.current.open =
        false;
    }

    setActiveSubmenu(null);
  }

  function run(
    action: () => void,
  ) {
    action();
    closeMenu();
  }

  function react(
    emoji: string,
  ) {
    onReact(emoji);
    setReactionsOpen(false);
  }

  async function loadFollowState() {
    if (followLoaded) {
      return;
    }

    try {
      const result =
        await api<{
          following: boolean;
        }>(
          `/api/messages/${threadId}/follow`,
        );

      setFollowing(
        result.following,
      );

      setFollowLoaded(true);
    } catch {
      /*
       * Keep the hover toolbar usable even
       * if thread-follow state cannot load.
       */
    }
  }

  async function toggleFollow() {
    if (followBusy) {
      return;
    }

    setFollowBusy(true);

    try {
      const result =
        await api<{
          following: boolean;
        }>(
          `/api/messages/${threadId}/follow`,
          {
            method: "POST",
          },
        );

      setFollowing(
        result.following,
      );

      setFollowLoaded(true);
      closeMenu();
    } finally {
      setFollowBusy(false);
    }
  }

  const quickThumb =
    applySkinTone(
      "👍",
      skinTone,
    );

  const quickHands =
    applySkinTone(
      "🙌",
      skinTone,
    );

  return (
    <div className="message-hover-actions clickup-message-actions">
      <button
        type="button"
        className="quick-emoji-action"
        title={`React with ${quickThumb}`}
        onClick={() =>
          react(quickThumb)
        }
      >
        <EmojiGlyph
          emoji={quickThumb}
          size={18}
        />
      </button>

      <button
        type="button"
        className="quick-emoji-action"
        title={`React with ${quickHands}`}
        onClick={() =>
          react(quickHands)
        }
      >
        <EmojiGlyph
          emoji={quickHands}
          size={18}
        />
      </button>

      <button
        type="button"
        className="quick-emoji-action"
        title="React with ✅"
        onClick={() =>
          react("✅")
        }
      >
        <EmojiGlyph
          emoji="✅"
          size={18}
        />
      </button>

      <div className="reaction-trigger">
        <button
          type="button"
          title="Add reaction"
          aria-expanded={
            reactionsOpen
          }
          onClick={() =>
            setReactionsOpen(
              (current) =>
                !current,
            )
          }
        >
          <SmilePlus size={15} />
        </button>

        {reactionsOpen && (
          <ReactionPicker
            onSelect={react}
          />
        )}
      </div>

      <span className="message-action-separator" />

      <button
        type="button"
        title="Reply"
        onClick={onReply}
      >
        <MessageCircleReply
          size={15}
        />
      </button>

      <button
        type="button"
        title="Copy link"
        onClick={onCopyLink}
      >
        <Share2 size={15} />
      </button>

      {onAssign && (
        <button
          type="button"
          title="Assign message"
          onClick={onAssign}
        >
          <UserRoundCheck
            size={15}
          />
        </button>
      )}

      {onTask && (
        <button
          type="button"
          title="Create task"
          className="message-task-quick"
          onClick={onTask}
        >
          <ClipboardPlus
            size={15}
          />
        </button>
      )}

      <details
        className="message-more clickup-message-more"
        ref={detailsRef}
        onToggle={(
          event,
        ) => {
          if (
            event.currentTarget
              .open
          ) {
            void loadFollowState();
          } else {
            setActiveSubmenu(
              null,
            );
          }
        }}
      >
        <summary title="More">
          <Ellipsis size={17} />
        </summary>

        <div className="message-more-menu">
          <button
            type="button"
            onClick={() =>
              run(
                onMarkUnread,
              )
            }
          >
            <MessageCircleReply
              size={15}
            />

            <span>
              Mark as unread
            </span>

            <kbd>U</kbd>
          </button>

          <button
            type="button"
            onClick={() =>
              run(onQuote)
            }
          >
            <Quote size={15} />

            <span>
              Quote in reply
            </span>

            <kbd>Q</kbd>
          </button>

          <button
            type="button"
            onClick={() =>
              run(onCopyLink)
            }
          >
            <Link2 size={15} />

            <span>
              Copy link
            </span>

            <kbd>C</kbd>
          </button>

          <button
            type="button"
            onClick={() =>
              run(onCopy)
            }
          >
            <Clipboard
              size={15}
            />

            <span>
              Copy message
            </span>

            <kbd>
              Ctrl+C
            </kbd>
          </button>

          <div className="message-menu-separator" />

          <div className="message-submenu-wrap">
            <button
              type="button"
              onClick={() =>
                setActiveSubmenu(
                  activeSubmenu ===
                    "remind"
                    ? null
                    : "remind",
                )
              }
            >
              <Clock3
                size={15}
              />

              <span>
                Remind me in Inbox
              </span>

              <ChevronRight
                size={15}
              />
            </button>

            {activeSubmenu ===
              "remind" && (
              <div className="message-submenu">
                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      onRemind(
                        "1h",
                      ),
                    )
                  }
                >
                  In 1 hour
                </button>

                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      onRemind(
                        "later-today",
                      ),
                    )
                  }
                >
                  Later today
                </button>

                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      onRemind(
                        "tomorrow",
                      ),
                    )
                  }
                >
                  Tomorrow
                </button>

                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      onRemind(
                        "next-week",
                      ),
                    )
                  }
                >
                  Next week
                </button>
              </div>
            )}
          </div>

          {(onTask ||
            onAssign) && (
            <div className="message-submenu-wrap">
              <button
                type="button"
                onClick={() =>
                  setActiveSubmenu(
                    activeSubmenu ===
                      "relationship"
                      ? null
                      : "relationship",
                  )
                }
              >
                <GitBranch
                  size={15}
                />

                <span>
                  Add relationship
                </span>

                <ChevronRight
                  size={15}
                />
              </button>

              {activeSubmenu ===
                "relationship" && (
                <div className="message-submenu">
                  {onTask && (
                    <button
                      type="button"
                      onClick={() =>
                        run(
                          onTask,
                        )
                      }
                    >
                      Create task
                      from message
                    </button>
                  )}

                  {onAssign && (
                    <button
                      type="button"
                      onClick={() =>
                        run(
                          onAssign,
                        )
                      }
                    >
                      Assign
                      follow-up
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="message-menu-separator" />

          <button
            type="button"
            disabled={
              followBusy
            }
            onClick={() =>
              void toggleFollow()
            }
          >
            {following ? (
              <BellOff
                size={15}
              />
            ) : (
              <Bell
                size={15}
              />
            )}

            <span>
              {following
                ? "Stop notifications for replies"
                : "Get notified about new replies"}
            </span>
          </button>

          {own &&
            (onEdit ||
              onDelete) && (
              <>
                <div className="message-menu-separator" />

                {onEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      run(
                        onEdit,
                      )
                    }
                  >
                    <Edit3
                      size={
                        15
                      }
                    />

                    <span>
                      Edit message
                    </span>
                  </button>
                )}

                {onDelete && (
                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      run(
                        onDelete,
                      )
                    }
                  >
                    <Trash2
                      size={
                        15
                      }
                    />

                    <span>
                      Delete message
                    </span>
                  </button>
                )}
              </>
            )}
        </div>
      </details>
    </div>
  );
}
