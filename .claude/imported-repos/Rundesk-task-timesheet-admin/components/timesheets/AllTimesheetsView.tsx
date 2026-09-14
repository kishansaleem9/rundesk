"use client";

import { LoaderCircle, Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/rundesk/api";
import { useStoredFlag, useStoredValue, writeStorage } from "@/lib/rundesk/storage";
import { formatDuration, type DayKey } from "@/lib/rundesk/time";
import type { TimesheetOverviewResponse } from "@/lib/rundesk/types";

import MembersFilter from "./MembersFilter";
import PeopleGrid from "./PeopleGrid";
import WeekNav from "./WeekNav";

// Persisted UI preferences (see lib/rundesk/storage.ts).
const CHANNEL_KEY = "rundesk:timesheets:people:channel";
const TRACKED_KEY = "rundesk:timesheets:people:tracked-only";

interface Props {
  weekStart: DayKey;
  todayKey: DayKey;
  timeZone: string;
  viewerId: string;
  /** Bumped by the shell when the window regains focus; triggers a silent refetch. */
  refreshKey: number;
  onChangeWeek: (weekStart: DayKey) => void;
  onOpen: (userId: string, weekStart: DayKey) => void;
  /** Must be referentially stable (a state setter or a useCallback). */
  onPendingCount: (count: number) => void;
}

function fetchOverview(weekStart: DayKey, timeZone: string, channelId: string | null) {
  const params = new URLSearchParams({ week: weekStart, tz: timeZone });

  if (channelId) {
    params.set("channelId", channelId);
  }

  return api<TimesheetOverviewResponse>(`/api/timesheets/overview?${params}`);
}

/**
 * "All timesheets": every workspace member for one week, optionally narrowed
 * to a channel's members. Admin-only; the shell never renders it otherwise.
 */
export default function AllTimesheetsView({
  weekStart,
  todayKey,
  timeZone,
  viewerId,
  refreshKey,
  onChangeWeek,
  onOpen,
  onPendingCount,
}: Props) {
  const channelId = useStoredValue(CHANNEL_KEY);
  const trackedOnly = useStoredFlag(TRACKED_KEY);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    overview: TimesheetOverviewResponse;
  } | null>(null);
  const [error, setError] = useState("");

  // The data on screen is stale whenever its key differs from the current request.
  const requestKey = `${weekStart}|${timeZone}|${channelId ?? ""}|${refreshKey}|${attempt}`;
  const overview = loaded?.overview ?? null;
  const loading = loaded?.key !== requestKey;

  useEffect(() => {
    let cancelled = false;

    fetchOverview(weekStart, timeZone, channelId)
      .then((next) => {
        if (cancelled) {
          return;
        }

        setLoaded({ key: requestKey, overview: next });
        setError("");
        onPendingCount(next.pendingCount);
      })
      .catch((reason) => {
        if (cancelled) {
          return;
        }

        const message = reason instanceof Error ? reason.message : "Could not load the team";

        if (channelId && /channel not found/i.test(message)) {
          // The remembered channel is gone or hidden: fall back to everyone.
          writeStorage(CHANNEL_KEY, null);
          return;
        }

        setError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [weekStart, timeZone, channelId, requestKey, onPendingCount]);

  const rows = useMemo(() => {
    const members = overview?.members ?? [];

    return trackedOnly
      ? members.filter((member) => member.weekSeconds > 0 || member.running)
      : members;
  }, [overview, trackedOnly]);

  const teamByDay = useMemo(() => {
    const totals: Record<string, number> = {};

    for (const day of overview?.days ?? []) {
      totals[day] = rows.reduce((sum, member) => sum + (member.byDay[day] ?? 0), 0);
    }

    return totals;
  }, [overview, rows]);

  const teamWeek = rows.reduce((sum, member) => sum + member.weekSeconds, 0);
  const selectedChannel = overview?.channels.find((channel) => channel.id === channelId) ?? null;

  return (
    <div
      role="tabpanel"
      id="timesheet-panel-all"
      aria-labelledby="timesheet-tab-all"
      className="timesheet-panel"
    >
      <div className="timesheet-toolbar">
        <WeekNav weekStart={weekStart} todayKey={todayKey} onChange={onChangeWeek} />

        <div className="timesheet-toolbar-right">
          <div className="timesheet-week-total">
            <span>Team total</span>
            <strong>{formatDuration(teamWeek)}</strong>
          </div>

          <MembersFilter
            channels={overview?.channels ?? []}
            channelId={channelId}
            onChange={(next) => writeStorage(CHANNEL_KEY, next)}
          />
        </div>
      </div>

      {error && overview && (
        <p className="form-error timesheet-message" role="status">
          {error}
        </p>
      )}

      <div className="timesheet-filters">
        <div className="timesheet-chips" role="group" aria-label="Filters">
          <button
            type="button"
            className={trackedOnly ? "timesheet-chip is-active" : "timesheet-chip"}
            aria-pressed={trackedOnly}
            title="Only people with time this week"
            onClick={() => writeStorage(TRACKED_KEY, trackedOnly ? null : "true")}
          >
            <Timer size={13} aria-hidden="true" />
            Tracked time
          </button>
        </div>
      </div>

      {!overview && !error ? (
        <div className="timesheet-center">
          <LoaderCircle className="spin" size={22} />
          <span>Loading team…</span>
        </div>
      ) : !overview ? (
        <div className="timesheet-empty">
          <strong>Couldn’t load the team</strong>
          <p>{error}</p>
          <button
            type="button"
            className="timesheet-action"
            onClick={() => setAttempt((current) => current + 1)}
          >
            Try again
          </button>
        </div>
      ) : overview.members.length === 0 ? (
        <div className="timesheet-empty">
          <strong>{selectedChannel ? `No one in #${selectedChannel.name} yet` : "No members yet"}</strong>
          <p>
            {selectedChannel
              ? "Add people to the channel in Chat, or show all members."
              : "Invite people to the workspace to see their timesheets here."}
          </p>
          {selectedChannel && (
            <button
              type="button"
              className="timesheet-action"
              onClick={() => writeStorage(CHANNEL_KEY, null)}
            >
              All members
            </button>
          )}
        </div>
      ) : rows.length === 0 ? (
        <div className="timesheet-empty timesheet-empty-filtered">
          <strong>No tracked time this week</strong>
          <p>
            Nobody{selectedChannel ? ` in #${selectedChannel.name}` : ""} has tracked time in this
            week yet. Turn off “Tracked time” to see everyone.
          </p>
          <button
            type="button"
            className="timesheet-action"
            onClick={() => writeStorage(TRACKED_KEY, null)}
          >
            Clear filter
          </button>
        </div>
      ) : (
        <PeopleGrid
          rows={rows}
          days={overview.days}
          todayKey={todayKey}
          viewerId={viewerId}
          teamByDay={teamByDay}
          teamWeek={teamWeek}
          loading={loading}
          onOpen={(userId) => onOpen(userId, weekStart)}
        />
      )}
    </div>
  );
}
