"use client";

import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import {
  addDaysToKey,
  formatWeekRange,
  isDayKey,
  recentWeekStarts,
  startOfWeekKey,
  type DayKey,
} from "@/lib/rundesk/time";

import { useDismiss } from "./useDismiss";

interface Props {
  weekStart: DayKey;
  todayKey: DayKey;
  onChange: (weekStart: DayKey) => void;
}

const RECENT_WEEKS = 9;

/**
 * The week label doubles as a dropdown: this week, the previous eight, and a
 * date input to jump anywhere. Any picked date snaps to its Monday.
 */
export default function WeekPicker({ weekStart, todayKey, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const thisWeek = startOfWeekKey(todayKey);
  const lastWeek = addDaysToKey(thisWeek, -7);
  const recent = recentWeekStarts(todayKey, RECENT_WEEKS);
  const options = recent.includes(weekStart) ? recent : [weekStart, ...recent];

  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  function pick(next: DayKey) {
    onChange(next);
    setOpen(false);
  }

  function labelFor(week: DayKey) {
    if (week === thisWeek) {
      return "This week";
    }

    if (week === lastWeek) {
      return "Last week";
    }

    return null;
  }

  return (
    <div className="timesheet-weekpicker" ref={rootRef}>
      <button
        type="button"
        className="timesheet-weekpicker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Choose a week"
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarDays size={14} aria-hidden="true" />
        <h1>{formatWeekRange(weekStart)}</h1>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {open && (
        <div className="timesheet-weekpicker-menu">
          <ul role="listbox" aria-label="Recent weeks">
            {options.map((week) => {
              const label = labelFor(week);
              const selected = week === weekStart;

              return (
                <li key={week}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={selected ? "is-selected" : undefined}
                    onClick={() => pick(week)}
                  >
                    <span>
                      <strong>{label ?? formatWeekRange(week)}</strong>
                      {label && <small>{formatWeekRange(week)}</small>}
                    </span>
                    {selected && <Check size={14} aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>

          <label className="timesheet-weekpicker-jump">
            <span>Jump to a date</span>
            <input
              type="date"
              onChange={(event) => {
                const value = event.target.value;

                if (isDayKey(value)) {
                  pick(startOfWeekKey(value));
                }
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
