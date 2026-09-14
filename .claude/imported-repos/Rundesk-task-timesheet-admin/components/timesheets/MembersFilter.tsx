"use client";

import { Check, ChevronDown, Hash, Lock, Users } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import type { TimesheetOverviewChannel } from "@/lib/rundesk/types";

import { useDismiss } from "./useDismiss";

interface Props {
  channels: TimesheetOverviewChannel[];
  channelId: string | null;
  onChange: (channelId: string | null) => void;
}

/**
 * "All members ▾": narrows the people grid to one channel's members. Channels
 * stand in for teams; the list holds the public channels plus the private
 * ones the viewer belongs to.
 */
export default function MembersFilter({ channels, channelId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useDismiss(rootRef, open, close);

  const selected = channels.find((channel) => channel.id === channelId) ?? null;

  function pick(next: string | null) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div className="timesheet-weekpicker timesheet-members-filter" ref={rootRef}>
      <button
        type="button"
        className="timesheet-action timesheet-members-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Filter people by channel"
        onClick={() => setOpen((current) => !current)}
      >
        {selected ? (
          selected.isPrivate ? (
            <Lock size={13} aria-hidden="true" />
          ) : (
            <Hash size={13} aria-hidden="true" />
          )
        ) : (
          <Users size={13} aria-hidden="true" />
        )}
        <span>{selected ? selected.name : "All members"}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {open && (
        <div className="timesheet-weekpicker-menu timesheet-members-menu">
          <ul role="listbox" aria-label="Filter people by channel">
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!channelId}
                className={!channelId ? "is-selected" : undefined}
                onClick={() => pick(null)}
              >
                <span>
                  <strong>All members</strong>
                  <small>Everyone in the workspace</small>
                </span>
                {!channelId && <Check size={14} aria-hidden="true" />}
              </button>
            </li>

            {channels.map((channel) => {
              const isSelected = channel.id === channelId;

              return (
                <li key={channel.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={isSelected ? "is-selected" : undefined}
                    onClick={() => pick(channel.id)}
                  >
                    <span>
                      <strong>
                        {channel.isPrivate ? (
                          <Lock size={11} aria-hidden="true" />
                        ) : (
                          <Hash size={11} aria-hidden="true" />
                        )}
                        {channel.name}
                      </strong>
                    </span>
                    {isSelected && <Check size={14} aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>

          {!channels.length && (
            <p className="timesheet-members-empty">No channels yet, so everyone is listed.</p>
          )}
        </div>
      )}
    </div>
  );
}
