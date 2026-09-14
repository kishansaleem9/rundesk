"use client";

import { ArrowRight } from "lucide-react";

import Avatar from "@/components/rundesk/Avatar";
import {
  DAY_CAPACITY_SECONDS,
  formatDayHeader,
  formatDuration,
  isoWeekday,
  type DayKey,
} from "@/lib/rundesk/time";
import type { TimesheetOverviewMember } from "@/lib/rundesk/types";

import { SubmissionPill } from "./SubmissionStatus";
import { CapacityBar } from "./TimesheetGrid";

interface Props {
  rows: TimesheetOverviewMember[];
  days: DayKey[];
  todayKey: DayKey;
  viewerId: string;
  teamByDay: Record<string, number>;
  teamWeek: number;
  /** A refetch is in flight; the table stays visible but dimmed. */
  loading: boolean;
  onOpen: (userId: string) => void;
}

/** "0h" for nothing, otherwise "3h 51m". */
function hours(seconds: number) {
  return seconds ? formatDuration(seconds) : "0h";
}

function cellClass(day: DayKey, todayKey: DayKey) {
  return [day === todayKey ? "is-today" : "", isoWeekday(day) >= 6 ? "is-weekend" : ""]
    .filter(Boolean)
    .join(" ") || undefined;
}

/**
 * People-by-day grid for admins: one row per member with their day totals,
 * weekly total, submission status and whether they are tracking right now.
 * Reuses the task grid's table styling and capacity bars.
 */
export default function PeopleGrid({
  rows,
  days,
  todayKey,
  viewerId,
  teamByDay,
  teamWeek,
  loading,
  onOpen,
}: Props) {
  return (
    <div
      className={
        loading
          ? "timesheet-grid-wrap timesheet-people-wrap is-loading"
          : "timesheet-grid-wrap timesheet-people-wrap"
      }
      aria-busy={loading}
    >
      <table className="timesheet-grid timesheet-people">
        <thead>
          <tr>
            <th scope="col" className="timesheet-task-col timesheet-people-col">
              <span className="timesheet-day-label">People ({rows.length})</span>
            </th>

            {days.map((day) => (
              <th key={day} scope="col" className={cellClass(day, todayKey)}>
                <span className="timesheet-day-label">{formatDayHeader(day)}</span>
                <b className="timesheet-day-total">{hours(teamByDay[day] ?? 0)}</b>
              </th>
            ))}

            <th scope="col" className="timesheet-total-col">
              <span className="timesheet-day-label">Total</span>
              <b className="timesheet-day-total">{hours(teamWeek)}</b>
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((member) => (
            <tr key={member.user.id} className={member.running ? "is-running" : undefined}>
              <th scope="row" className="timesheet-task-col timesheet-people-col">
                <div className="timesheet-person">
                  <Avatar user={member.user} size={28} />

                  <div className="timesheet-person-copy">
                    <strong title={member.user.name}>
                      {member.user.name}
                      {member.user.id === viewerId && <small>(you)</small>}
                    </strong>
                    <span>
                      {member.running && (
                        <i
                          className="timesheet-person-live"
                          role="img"
                          aria-label="Timer running"
                          title="Timer running"
                        />
                      )}
                      <em title="Weekly capacity">{formatDuration(member.capacitySeconds)}</em>
                      <SubmissionPill submission={member.submission} compact />
                    </span>
                  </div>

                  <button
                    type="button"
                    className="timesheet-action timesheet-person-open"
                    aria-label={`Open ${member.user.name}’s timesheet`}
                    onClick={() => onOpen(member.user.id)}
                  >
                    Open
                    <ArrowRight size={12} aria-hidden="true" />
                  </button>
                </div>
              </th>

              {days.map((day) => {
                const seconds = member.byDay[day] ?? 0;

                return (
                  <td key={day} className={cellClass(day, todayKey)}>
                    <div className={seconds ? "timesheet-people-cell has-time" : "timesheet-people-cell"}>
                      <span>{hours(seconds)}</span>
                      <CapacityBar seconds={seconds} capacity={DAY_CAPACITY_SECONDS} />
                    </div>
                  </td>
                );
              })}

              <td className="timesheet-total-col">
                <div className="timesheet-people-cell has-time">
                  <strong>{hours(member.weekSeconds)}</strong>
                  <CapacityBar seconds={member.weekSeconds} capacity={member.capacitySeconds} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
