"use client";

import { useCallback, useEffect, useState } from "react";

import { secondsBetween } from "@/lib/rundesk/time";
import { fetchActiveTimer } from "@/lib/rundesk/timer";
import type { TimeEntry } from "@/lib/rundesk/types";

/**
 * The signed-in user's running timer: the single source of truth for the top
 * bar pill, the task detail panel and the task list. Loaded on mount,
 * refreshed when the window regains focus (a timer started on /timesheets or
 * in another tab shows up), ticking once a second while a timer runs.
 * Mutations call `setTimer` with the server's response; nothing else writes it.
 */
export function useActiveTimer() {
  const [timer, setTimer] = useState<TimeEntry | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(
    () =>
      fetchActiveTimer()
        .then((next) => setTimer(next))
        .catch(() => {
          // Keep the last known timer; the next focus or mutation corrects it.
        }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const sync = () => {
      fetchActiveTimer()
        .then((next) => {
          if (!cancelled) {
            setTimer(next);
          }
        })
        .catch(() => {
          // See refresh().
        });
    };

    sync();
    window.addEventListener("focus", sync);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", sync);
    };
  }, []);

  // The first interval tick, a second in, brings `now` up to date; until then
  // secondsBetween clamps a stale `now` to zero.
  useEffect(() => {
    if (!timer) {
      return;
    }

    const id = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(id);
  }, [timer]);

  const seconds = timer ? secondsBetween(new Date(timer.startedAt), new Date(now)) : 0;

  return { timer, seconds, setTimer, refresh };
}
