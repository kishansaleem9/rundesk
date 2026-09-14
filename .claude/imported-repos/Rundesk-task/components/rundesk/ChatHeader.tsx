"use client";

import {
  Bell,
  BellOff,
  ChevronDown,
  Ellipsis,
  LockKeyhole,
  Phone,
  Plus,
  Search,
  Share2,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import type { Channel } from "@/lib/rundesk/types";

import ChannelActionsMenu from "./ChannelActionsMenu";
import ShareMenu from "./ShareMenu";
import ViewMenu from "./ViewMenu";

export default function ChatHeader({
  channel,
  currentUserId,
  muted,
  onDetails,
  onEdit,
  onDelete,
  onToggleMute,
  onSearch,
  onMembers,
  onCall,
}: {
  channel: Channel;
  currentUserId: string;
  muted: boolean;
  onDetails: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleMute: () => void;
  onSearch: () => void;
  onMembers: () => void;
  onCall: () => void;
}) {
  const [favorite, setFavorite] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return (
      localStorage.getItem(
        `rundesk:favorite:${channel.id}`,
      ) === "true"
    );
  });

  const [channelMenu, setChannelMenu] = useState(false);
  const [viewMenu, setViewMenu] = useState(false);
  const [shareMenu, setShareMenu] = useState(false);

  const menuRef =
    useRef<HTMLDivElement>(null);

  const viewButtonRef =
    useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setChannelMenu(false);
      }
    };

    document.addEventListener("mousedown", outside);

    return () =>
      document.removeEventListener("mousedown", outside);
  }, []);

  useEffect(() => {
    setFavorite(
      localStorage.getItem(
        `rundesk:favorite:${channel.id}`,
      ) === "true",
    );

    setChannelMenu(false);
    setViewMenu(false);
    setShareMenu(false);
  }, [channel.id]);

  const toggleFavorite = () => {
    setFavorite((current) => {
      const next = !current;

      localStorage.setItem(
        `rundesk:favorite:${channel.id}`,
        String(next),
      );

      return next;
    });
  };

  const memberCount =
    channel._count?.members ?? 0;

  return (
    <header className="chat-header">
      <div className="chat-title-row">
        <button
          className="channel-heading"
          onClick={onDetails}
        >
          <span className="hash-icon">#</span>

          <div>
            <h1>{channel.name}</h1>

            <span>
              {channel.isPrivate && (
                <LockKeyhole size={11} />
              )}{" "}
              {channel.description ||
                (channel.isPrivate
                  ? "Private channel"
                  : "Team channel")}
            </span>
          </div>
        </button>

        <div className="channel-title-actions">
          <button
            className={`icon-button ${
              favorite ? "is-favorite" : ""
            }`}
            title={
              favorite
                ? "Remove favorite"
                : "Favorite channel"
            }
            onClick={toggleFavorite}
          >
            <Star
              size={16}
              fill={
                favorite
                  ? "currentColor"
                  : "none"
              }
            />
          </button>

          <div
            className="channel-menu-anchor"
            ref={menuRef}
          >
            <button
              className="icon-button"
              onClick={() =>
                setChannelMenu((value) => !value)
              }
              aria-label="More channel actions"
            >
              <Ellipsis size={18} />
            </button>

            {channelMenu && (
              <ChannelActionsMenu
                channel={channel}
                muted={muted}
                canDelete={
                  channel.createdById === currentUserId
                }
                onClose={() => setChannelMenu(false)}
                onDetails={() => {
                  setChannelMenu(false);
                  onDetails();
                }}
                onEdit={() => {
                  setChannelMenu(false);
                  onEdit();
                }}
                onMembers={() => {
                  setChannelMenu(false);
                  onMembers();
                }}
                onToggleMute={() => {
                  setChannelMenu(false);
                  onToggleMute();
                }}
                onDelete={() => {
                  setChannelMenu(false);
                  onDelete();
                }}
              />
            )}
          </div>
        </div>

        <div className="header-actions">
          <button
            className="header-ghost"
            onClick={onSearch}
          >
            <Search size={16} />
            <span>Search</span>
          </button>

          <button
            className="header-ghost"
            onClick={onMembers}
          >
            <Users size={16} />
            <span>{memberCount || "Members"}</span>
          </button>

          <button
            className="split-call"
            onClick={onCall}
          >
            <Phone size={16} />
            <span>Call</span>
            <ChevronDown size={13} />
          </button>

          <button
            className="icon-button ai-head"
            title="Rundesk AI"
          >
            <Sparkles size={16} />
          </button>

          <button
            className={`icon-button ${
              muted ? "muted" : ""
            }`}
            onClick={onToggleMute}
            aria-label={
              muted
                ? "Unmute notifications"
                : "Mute notifications"
            }
          >
            {muted ? (
              <BellOff size={16} />
            ) : (
              <Bell size={16} />
            )}
          </button>

          <button
            className="share-ghost"
            onClick={() => {
              setViewMenu(false);
              setShareMenu(true);
            }}
          >
            <Share2 size={15} />
            <span>
              Share
              {memberCount > 0
                ? ` · ${memberCount}`
                : ""}
            </span>
          </button>
        </div>
      </div>

      <nav className="channel-tabs">
        <button className="active">
          Channel
        </button>

        <button
          ref={viewButtonRef}
          type="button"
          className={
            viewMenu
              ? "view-tab-button open"
              : "view-tab-button"
          }
          onClick={() => {
            setShareMenu(false);
            setViewMenu((current) => !current);
          }}
          aria-expanded={viewMenu}
        >
          <Plus size={14} />
          View
        </button>
      </nav>

      {viewMenu && (
        <ViewMenu
          channelId={channel.id}
          anchorRef={viewButtonRef}
          onClose={() => setViewMenu(false)}
        />
      )}

      {shareMenu && (
        <ShareMenu
          channel={channel}
          memberCount={memberCount}
          onMembers={onMembers}
          onClose={() => setShareMenu(false)}
        />
      )}
    </header>
  );
}
