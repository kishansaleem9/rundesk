import type { SuperAgentSchedule } from '@rundesk/db'
import { instantOfLocal, localNaiveMs } from '../../common/time/zone'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/**
 * THE LAST TIME A SCHEDULE NAMED, at or before `now`: hourly at its minute,
 * daily at its time, weekly on its weekday, monthly on its day — each on the
 * wall clock of `timeZone` (its maker's), as ClickUp's scheduled agents run.
 */
export function lastSlot(s: Pick<SuperAgentSchedule, 'every' | 'at' | 'weekday' | 'day'>, now: Date, timeZone: string): Date {
  const [hh, mm] = (s.at ?? '09:00').split(':').map(Number)
  const local = localNaiveMs(timeZone, now)
  const d = new Date(local)
  const y = d.getUTCFullYear()
  const mo = d.getUTCMonth()
  const day = d.getUTCDate()
  let slot: number
  switch (s.every) {
    case 'hourly': {
      slot = Date.UTC(y, mo, day, d.getUTCHours(), mm)
      if (slot > local) slot -= HOUR
      break
    }
    case 'daily': {
      slot = Date.UTC(y, mo, day, hh, mm)
      if (slot > local) slot -= DAY
      break
    }
    case 'weekly': {
      const weekday = s.weekday ?? 1
      slot = Date.UTC(y, mo, day, hh, mm) - ((d.getUTCDay() - weekday + 7) % 7) * DAY
      if (slot > local) slot -= 7 * DAY
      break
    }
    default: {
      const on = s.day ?? 1
      slot = Date.UTC(y, mo, on, hh, mm)
      if (slot > local) slot = Date.UTC(y, mo - 1, on, hh, mm)
    }
  }
  return instantOfLocal(timeZone, slot)
}

/**
 * IS A RUN OWED NOW? Yes when the last time the schedule named has come and
 * nothing ran for it: no scheduled run started since that time, and the
 * schedule was set before it (`since`), so switching a schedule on never runs
 * it at once for a time already gone.
 */
export function scheduleDue(s: SuperAgentSchedule, now: Date, lastStartedAt: Date | null, timeZone: string): boolean {
  if (!s.on) return false
  const slot = lastSlot(s, now, timeZone).getTime()
  if (slot > now.getTime()) return false
  const since = s.since ? Date.parse(s.since) : NaN
  if (Number.isFinite(since) && slot < since) return false
  return !lastStartedAt || lastStartedAt.getTime() < slot
}
