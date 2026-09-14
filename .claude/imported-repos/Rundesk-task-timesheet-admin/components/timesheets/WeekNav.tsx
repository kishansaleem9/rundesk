"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { addDaysToKey, startOfWeekKey, type DayKey } from "@/lib/rundesk/time";

import WeekPicker from "./WeekPicker";

interface Props {
  weekStart: DayKey;
  todayKey: DayKey;
  onChange: (weekStart: DayKey) => void;
  /** Trailing content, e.g. the submission status pill. */
  children?: ReactNode;
}

/** ‹ week label ▾ › plus a "This week" shortcut when the view has moved away from it. */
export default function WeekNav({ weekStart, todayKey, onChange, children }: Props) {
  const thisWeek = startOfWeekKey(todayKey);

  return (
    <div className="timesheet-week-nav" aria-label="Week navigation">
      <button
        type="button"
        title="Previous week"
        onClick={() => onChange(addDaysToKey(weekStart, -7))}
      >
        <ChevronLeft size={16} />
      </button>

      <WeekPicker weekStart={weekStart} todayKey={todayKey} onChange={onChange} />

      <button type="button" title="Next week" onClick={() => onChange(addDaysToKey(weekStart, 7))}>
        <ChevronRight size={16} />
      </button>

      {weekStart !== thisWeek && (
        <button type="button" className="timesheet-this-week" onClick={() => onChange(thisWeek)}>
          This week
        </button>
      )}

      {children}
    </div>
  );
}
