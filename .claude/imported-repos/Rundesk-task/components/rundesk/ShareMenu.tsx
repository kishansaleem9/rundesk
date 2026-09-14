"use client";

import {
  Check,
  ChevronRight,
  Copy,
  Link2,
  LockKeyhole,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type { Channel } from "@/lib/rundesk/types";

export default function ShareMenu({
  channel,
  memberCount,
  onMembers,
  onClose,
}: {
  channel: Channel;
  memberCount: number;
  onMembers: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  const [workspaceShared, setWorkspaceShared] =
    useState(() => {
      if (typeof window === "undefined") {
        return false;
      }

      return (
        localStorage.getItem(
          `rundesk:workspace-share:${channel.id}`,
        ) === "true"
      );
    });

  useEffect(() => {
    setMounted(true);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const channelUrl = () => {
    const url = new URL(window.location.href);

    url.searchParams.set("channel", channel.id);
    url.hash = "";

    return url.toString();
  };

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(channelUrl());
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1600);
    } catch {
      window.prompt("Copy this channel link:", channelUrl());
    }
  }

  function toggleWorkspaceShare() {
    const next = !workspaceShared;

    setWorkspaceShared(next);

    localStorage.setItem(
      `rundesk:workspace-share:${channel.id}`,
      String(next),
    );
  }

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className="rd-share-overlay" role="presentation">
      <button
        type="button"
        className="rd-share-backdrop"
        aria-label="Close share dialog"
        onClick={onClose}
      />

      <section
        className="rd-share-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${channel.name}`}
      >
        <header className="rd-share-head">
          <div>
            <h2>Share this Channel</h2>

            <p>
              Sharing{" "}
              <strong>
                # {channel.name}
              </strong>
              {channel.isPrivate && (
                <LockKeyhole size={12} />
              )}
            </p>
          </div>

          <button
            type="button"
            className="rd-share-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="rd-share-content">
          <div className="rd-private-link-row">
            <div className="rd-private-link-copy">
              <Link2 size={16} />

              <div>
                <strong>Private link</strong>
                <small>
                  Only people with channel access can open this link
                </small>
              </div>
            </div>

            <button
              type="button"
              className="rd-copy-link-button"
              onClick={() => void copyLink()}
            >
              {copied ? (
                <>
                  <Check size={14} />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy link
                </>
              )}
            </button>
          </div>

          <div className="rd-share-label">
            Share with
          </div>

          <button
            type="button"
            className="rd-share-access-row"
            onClick={toggleWorkspaceShare}
          >
            <ChevronRight size={13} />

            <span className="rd-access-icon">
              A
            </span>

            <span className="rd-access-copy">
              <strong>AURA</strong>
              <small>Workspace members</small>
            </span>

            <span
              className={
                workspaceShared
                  ? "rd-share-switch on"
                  : "rd-share-switch"
              }
              aria-hidden="true"
            >
              <i />
            </span>
          </button>

          <button
            type="button"
            className="rd-share-access-row"
            onClick={() => {
              onClose();
              onMembers();
            }}
          >
            <ChevronRight size={13} />

            <Users size={18} />

            <span className="rd-access-copy">
              <strong>People</strong>
              <small>
                Manage who can access this channel
              </small>
            </span>

            <span className="rd-member-stack">
              <span>MZ</span>
              {memberCount > 1 && (
                <b>+{memberCount - 1}</b>
              )}
            </span>
          </button>
        </div>
      </section>

      <style>{`
        .rd-share-overlay {
          position: fixed;
          inset: 0;
          z-index: 1300;
          display: grid;
          place-items: center;
          font-family: inherit;
        }

        .rd-share-backdrop {
          position: absolute;
          inset: 0;
          border: 0;
          background: rgba(27, 29, 34, 0.64);
          cursor: default;
        }

        .rd-share-modal {
          position: relative;
          z-index: 1;
          width: min(570px, calc(100vw - 32px));
          overflow: hidden;
          border: 1px solid #dddde2;
          border-radius: 12px;
          background: #fff;
          box-shadow:
            0 22px 70px rgba(16, 18, 24, 0.28),
            0 4px 14px rgba(16, 18, 24, 0.12);
          color: #252830;
        }

        .rd-share-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding: 20px 20px 14px;
        }

        .rd-share-head h2 {
          margin: 0;
          color: #252830;
          font-size: 17px;
          font-weight: 700;
        }

        .rd-share-head p {
          display: flex;
          align-items: center;
          gap: 5px;
          margin: 7px 0 0;
          color: #7c818b;
          font-size: 12px;
        }

        .rd-share-head p strong {
          color: #363a42;
          font-weight: 650;
        }

        .rd-share-close {
          width: 28px;
          height: 28px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 50%;
          background: #f0f0f2;
          color: #757a84;
          cursor: pointer;
        }

        .rd-share-close:hover {
          background: #e8e8eb;
          color: #343840;
        }

        .rd-share-content {
          padding: 0 20px 18px;
        }

        .rd-private-link-row {
          min-height: 58px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 8px 0 14px;
          border-bottom: 1px solid #ededf1;
        }

        .rd-private-link-copy {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .rd-private-link-copy > div {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .rd-private-link-copy strong {
          font-size: 13px;
          font-weight: 650;
          color: #2f333b;
        }

        .rd-private-link-copy small {
          color: #969aa3;
          font-size: 10px;
        }

        .rd-copy-link-button {
          min-height: 31px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 0 10px;
          border: 1px solid #d9dae0;
          border-radius: 7px;
          background: #fff;
          color: #545963;
          font: inherit;
          font-size: 11px;
          cursor: pointer;
          white-space: nowrap;
        }

        .rd-copy-link-button:hover {
          background: #f6f6f8;
        }

        .rd-share-label {
          padding: 17px 0 7px;
          color: #7e838c;
          font-size: 11px;
          font-weight: 600;
        }

        .rd-share-access-row {
          width: 100%;
          min-height: 45px;
          display: grid;
          grid-template-columns: 14px 24px minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
          padding: 5px 6px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: #363a42;
          text-align: left;
          cursor: pointer;
        }

        .rd-share-access-row:hover {
          background: #f7f6f8;
        }

        .rd-access-icon {
          width: 22px;
          height: 22px;
          display: grid;
          place-items: center;
          border-radius: 6px;
          background: #111;
          color: #fff;
          font-size: 9px;
          font-weight: 700;
        }

        .rd-access-copy {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .rd-access-copy strong {
          color: #2f333b;
          font-size: 12.5px;
          font-weight: 650;
        }

        .rd-access-copy small {
          display: inline-flex;
          align-items: center;
          min-height: 20px;
          padding: 0 8px;
          border-radius: 999px;
          background: #f4f3f6;
          color: #868a93;
          font-size: 9px;
        }

        .rd-share-switch {
          width: 30px;
          height: 17px;
          display: inline-flex;
          align-items: center;
          padding: 2px;
          border-radius: 999px;
          background: #c8c9cf;
          transition: background 120ms ease;
        }

        .rd-share-switch i {
          width: 13px;
          height: 13px;
          display: block;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 1px 2px rgba(0,0,0,.2);
          transform: translateX(0);
          transition: transform 120ms ease;
        }

        .rd-share-switch.on {
          background: #7a67d8;
        }

        .rd-share-switch.on i {
          transform: translateX(13px);
        }

        .rd-member-stack {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .rd-member-stack > span {
          width: 25px;
          height: 25px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: linear-gradient(135deg, #7765d4, #cc65a7);
          color: #fff;
          font-size: 8px;
          font-weight: 700;
        }

        .rd-member-stack > b {
          min-width: 24px;
          height: 24px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #f1f0f4;
          color: #737883;
          font-size: 8px;
          font-weight: 650;
        }

        @media (max-width: 560px) {
          .rd-share-modal {
            width: calc(100vw - 20px);
          }

          .rd-share-head,
          .rd-share-content {
            padding-left: 14px;
            padding-right: 14px;
          }

          .rd-access-copy small {
            display: none;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
