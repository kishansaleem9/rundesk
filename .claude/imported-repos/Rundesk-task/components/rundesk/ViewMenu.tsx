"use client";

import {
  Clapperboard,
  FileText,
  Link2,
  LockKeyhole,
  Search,
  Star,
  Users,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

type ViewItem = {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  iconClass: string;
  action: () => void;
};

function normalizeExternalUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(
      /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`,
    ).toString();
  } catch {
    return null;
  }
}

export default function ViewMenu({
  channelId,
  anchorRef,
  onClose,
}: {
  channelId: string;
  anchorRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
  });

  const [privateView, setPrivateView] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return (
      localStorage.getItem(
        `rundesk:view-private:${channelId}`,
      ) === "true"
    );
  });

  const [pinned, setPinned] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return (
      localStorage.getItem(
        `rundesk:view-pinned:${channelId}`,
      ) === "true"
    );
  });

  useEffect(() => {
    setMounted(true);

    const updatePosition = () => {
      const anchor = anchorRef.current;

      if (!anchor) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const width = Math.min(
        660,
        Math.max(420, window.innerWidth - 40),
      );

      let left = rect.left - 120;

      if (left + width > window.innerWidth - 16) {
        left = window.innerWidth - width - 16;
      }

      if (left < 16) {
        left = 16;
      }

      setPosition({
        top: rect.bottom + 8,
        left,
      });
    };

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorRef, onClose]);

  const openExternal = (
    label: string,
    suggested = "https://",
  ) => {
    const entered = window.prompt(
      `Paste the ${label} URL`,
      suggested,
    );

    if (!entered) {
      return;
    }

    const url = normalizeExternalUrl(entered);

    if (!url) {
      window.alert("Please enter a valid URL.");
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  const moreViews: ViewItem[] = [
    {
      id: "whiteboard",
      label: "Whiteboard",
      description: "Visualize & brainstorm ideas",
      icon: <FileText size={18} />,
      iconClass: "rd-view-icon-yellow",
      action: () => {
        window.dispatchEvent(
          new CustomEvent("rundesk:open-whiteboard"),
        );
        onClose();
      },
    },
  ];

  const embeds: ViewItem[] = [
    {
      id: "website",
      label: "Any website",
      description: "Embed any web content",
      icon: <Link2 size={18} />,
      iconClass: "rd-view-icon-neutral",
      action: () => openExternal("website"),
    },
    {
      id: "sheets",
      label: "Google Sheets",
      description: "Sync your spreadsheets",
      icon: <FileText size={18} />,
      iconClass: "rd-view-icon-green",
      action: () =>
        openExternal(
          "Google Sheets",
          "https://docs.google.com/spreadsheets/",
        ),
    },
    {
      id: "docs",
      label: "Google Docs",
      description: "Sync your documents",
      icon: <FileText size={18} />,
      iconClass: "rd-view-icon-blue",
      action: () =>
        openExternal(
          "Google Docs",
          "https://docs.google.com/document/",
        ),
    },
    {
      id: "calendar",
      label: "Google Calendar",
      description: "Sync Google Calendar events",
      icon: <FileText size={18} />,
      iconClass: "rd-view-icon-calendar",
      action: () =>
        openExternal(
          "Google Calendar",
          "https://calendar.google.com/",
        ),
    },
    {
      id: "maps",
      label: "Google Maps",
      description: "Find your way around",
      icon: <Link2 size={18} />,
      iconClass: "rd-view-icon-map",
      action: () =>
        openExternal(
          "Google Maps",
          "https://maps.google.com/",
        ),
    },
    {
      id: "youtube",
      label: "YouTube",
      description: "Share your favorite videos",
      icon: <Clapperboard size={18} />,
      iconClass: "rd-view-icon-red",
      action: () =>
        openExternal(
          "YouTube",
          "https://youtube.com/",
        ),
    },
    {
      id: "figma",
      label: "Figma",
      description: "View your amazing designs",
      icon: <Star size={18} />,
      iconClass: "rd-view-icon-figma",
      action: () =>
        openExternal(
          "Figma",
          "https://figma.com/",
        ),
    },
  ];

  const needle = query.trim().toLowerCase();

  const shownMore = useMemo(
    () =>
      moreViews.filter(
        (item) =>
          !needle ||
          item.label.toLowerCase().includes(needle) ||
          item.description.toLowerCase().includes(needle),
      ),
    [needle],
  );

  const shownEmbeds = useMemo(
    () =>
      embeds.filter(
        (item) =>
          !needle ||
          item.label.toLowerCase().includes(needle) ||
          item.description.toLowerCase().includes(needle),
      ),
    [needle],
  );

  const togglePrivate = () => {
    const next = !privateView;
    setPrivateView(next);

    localStorage.setItem(
      `rundesk:view-private:${channelId}`,
      String(next),
    );
  };

  const togglePinned = () => {
    const next = !pinned;
    setPinned(next);

    localStorage.setItem(
      `rundesk:view-pinned:${channelId}`,
      String(next),
    );
  };

  if (!mounted) {
    return null;
  }

  return createPortal(
    <>
      <button
        type="button"
        className="rd-view-dismiss-layer"
        aria-label="Close view menu"
        onClick={onClose}
      />

      <section
        className="rd-clickup-view-menu"
        style={{
          top: position.top,
          left: position.left,
        }}
        role="dialog"
        aria-label="Add a view"
      >
        <div className="rd-view-search-row">
          <label className="rd-view-search">
            <Search size={15} />
            <input
              autoFocus
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Search views..."
            />
          </label>
        </div>

        <div className="rd-view-scroll">
          {shownMore.length > 0 && (
            <section className="rd-view-section">
              <h3>More views</h3>

              {shownMore.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="rd-view-row rd-view-single"
                  onClick={item.action}
                >
                  <i className={item.iconClass}>
                    {item.icon}
                  </i>

                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                </button>
              ))}
            </section>
          )}

          {shownEmbeds.length > 0 && (
            <section className="rd-view-section rd-view-embeds">
              <h3>Embeds</h3>

              <div className="rd-view-grid">
                {shownEmbeds.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="rd-view-row"
                    onClick={item.action}
                  >
                    <i className={item.iconClass}>
                      {item.icon}
                    </i>

                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {!shownMore.length && !shownEmbeds.length && (
            <div className="rd-view-empty">
              No views found.
            </div>
          )}
        </div>

        <footer className="rd-view-footer">
          <button
            type="button"
            className={privateView ? "active" : ""}
            onClick={togglePrivate}
          >
            <span className="rd-view-checkbox">
              {privateView ? "✓" : ""}
            </span>
            <LockKeyhole size={13} />
            <span>Private view</span>
          </button>

          <button
            type="button"
            className={pinned ? "active" : ""}
            onClick={togglePinned}
          >
            <span className="rd-view-checkbox">
              {pinned ? "✓" : ""}
            </span>
            <Users size={13} />
            <span>Pin view</span>
          </button>
        </footer>
      </section>

      <style>{`
        .rd-view-dismiss-layer {
          position: fixed;
          inset: 0;
          z-index: 1098;
          border: 0;
          background: transparent;
          cursor: default;
        }

        .rd-clickup-view-menu {
          position: fixed;
          z-index: 1099;
          width: min(545px, calc(100vw - 32px));
          overflow: hidden;
          border: 1px solid #dedfe4;
          border-radius: 10px;
          background: #fff;
          box-shadow:
            0 14px 34px rgba(31, 35, 45, 0.15),
            0 2px 6px rgba(31, 35, 45, 0.07);
          color: #2f333b;
          font-family: inherit;
        }

        .rd-view-search-row {
          min-height: 38px;
          display: flex;
          align-items: center;
          padding: 6px 10px;
          border-bottom: 1px solid #ececf0;
        }

        .rd-view-search {
          width: 165px;
          height: 31px;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 0 8px;
          border: 1px solid #705dff;
          border-radius: 7px;
          background: #fff;
          box-shadow: 0 0 0 1px rgba(112,93,255,.08);
        }

        .rd-view-search input {
          width: 100%;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: #4b505a;
          font: inherit;
          font-size: 12px;
        }

        .rd-view-scroll {
          max-height: min(365px, calc(100vh - 190px));
          overflow-y: auto;
          overflow-x: hidden;
          padding: 0 10px 7px;
        }

        .rd-view-section {
          padding: 10px 3px 9px;
          border-bottom: 1px solid #eeeeF2;
        }

        .rd-view-section:last-child {
          border-bottom: 0;
        }

        .rd-view-section h3 {
          margin: 0 0 6px;
          color: #858991;
          font-size: 11px;
          font-weight: 650;
        }

        .rd-view-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          column-gap: 18px;
          row-gap: 2px;
        }

        .rd-view-row {
          width: 100%;
          min-height: 50px;
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr);
          align-items: center;
          gap: 9px;
          padding: 5px 6px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          text-align: left;
          color: inherit;
          cursor: pointer;
        }

        .rd-view-row:hover {
          background: #f6f5f8;
        }

        .rd-view-single {
          max-width: 240px;
        }

        .rd-view-row > i {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          font-style: normal;
          background: #f0f0f2;
          color: #666b75;
        }

        .rd-view-row > span {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .rd-view-row strong {
          overflow: hidden;
          color: #33373f;
          font-size: 12px;
          font-weight: 650;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rd-view-row small {
          overflow: hidden;
          color: #9397a0;
          font-size: 9px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rd-view-icon-yellow {
          color: #fff !important;
          background: #f6ba1d !important;
        }

        .rd-view-icon-green {
          color: #2f9f50 !important;
          background: #eef8f1 !important;
        }

        .rd-view-icon-blue {
          color: #2f85dd !important;
          background: #edf5fd !important;
        }

        .rd-view-icon-calendar {
          color: #4e72d8 !important;
          background: #eef2ff !important;
        }

        .rd-view-icon-map {
          color: #3e9e6e !important;
          background: #eef8f3 !important;
        }

        .rd-view-icon-red {
          color: #df3232 !important;
          background: #fff0f0 !important;
        }

        .rd-view-icon-figma {
          color: #7558ce !important;
          background: #f2eefe !important;
        }

        .rd-view-footer {
          min-height: 38px;
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 5px 12px;
          border-top: 1px solid #ececf0;
          background: #fff;
        }

        .rd-view-footer button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 0;
          background: transparent;
          color: #777c86;
          font: inherit;
          font-size: 11px;
          cursor: pointer;
        }

        .rd-view-footer button.active {
          color: #6456b2;
        }

        .rd-view-checkbox {
          width: 16px;
          height: 16px;
          display: grid;
          place-items: center;
          border: 1px solid #b9bdc7;
          border-radius: 4px;
          background: #fff;
          color: #fff;
          font-size: 9px;
        }

        .rd-view-footer button.active .rd-view-checkbox {
          border-color: #8a79e9;
          background: #8a79e9;
        }

        .rd-view-empty {
          padding: 42px 16px;
          color: #8c919a;
          text-align: center;
          font-size: 12px;
        }

        @media (max-width: 700px) {
          .rd-view-grid {
            grid-template-columns: 1fr;
          }

          .rd-view-search {
            width: 100%;
          }
        }
      `}</style>
    </>,
    document.body,
  );
}
