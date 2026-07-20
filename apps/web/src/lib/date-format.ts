import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'

// Plan §1.2 — per-user date / time / week-start display preferences. 'system'
// keeps the browser-locale default; explicit values format deterministically.
export type DateFormatPref = 'system' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD MMM YYYY'
export type TimeFormatPref = 'system' | '12h' | '24h'
export type WeekStartPref = 'sunday' | 'monday' | 'saturday'

export type DatePrefs = {
  dateFormat: DateFormatPref
  timeFormat: TimeFormatPref
  weekStart: WeekStartPref
}

export const DEFAULT_DATE_PREFS: DatePrefs = {
  dateFormat: 'system',
  timeFormat: 'system',
  weekStart: 'sunday',
}

type DateLike = Date | string | number | null | undefined

function toDate(input: DateLike): Date | null {
  if (input == null || input === '') return null
  const d = input instanceof Date ? input : new Date(input)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Format a date honouring the user's explicit dateFormat (or browser default). */
export function formatDateWith(prefs: DatePrefs, input: DateLike): string {
  const d = toDate(input)
  if (!d) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  switch (prefs.dateFormat) {
    case 'MM/DD/YYYY':
      return `${mm}/${dd}/${yyyy}`
    case 'DD/MM/YYYY':
      return `${dd}/${mm}/${yyyy}`
    case 'YYYY-MM-DD':
      return `${yyyy}-${mm}-${dd}`
    case 'DD MMM YYYY':
      return `${dd} ${d.toLocaleDateString(undefined, { month: 'short' })} ${yyyy}`
    default:
      return d.toLocaleDateString()
  }
}

/** Format a time honouring the user's 12h/24h preference (or browser default). */
export function formatTimeWith(prefs: DatePrefs, input: DateLike): string {
  const d = toDate(input)
  if (!d) return ''
  const hour12 = prefs.timeFormat === 'system' ? undefined : prefs.timeFormat === '12h'
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12 })
}

export function formatDateTimeWith(prefs: DatePrefs, input: DateLike): string {
  const d = toDate(input)
  if (!d) return ''
  return `${formatDateWith(prefs, d)} ${formatTimeWith(prefs, d)}`.trim()
}

/** date-fns / calendar `weekStartsOn` index (0=Sun … 6=Sat) for the preference. */
export function weekStartsOnIndex(pref: WeekStartPref): 0 | 1 | 6 {
  return pref === 'monday' ? 1 : pref === 'saturday' ? 6 : 0
}

/**
 * Read the caller's date/time/week-start preferences. Shares the ['users','me']
 * query cache with the rest of the app, so this adds no extra fetch. Falls back
 * to 'system' defaults until the profile loads (or for logged-out surfaces).
 */
export function useDatePrefs(): DatePrefs {
  const { data } = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => api<Partial<DatePrefs>>('/users/me'),
    staleTime: 60_000,
  })
  return {
    dateFormat: (data?.dateFormat as DateFormatPref) ?? 'system',
    timeFormat: (data?.timeFormat as TimeFormatPref) ?? 'system',
    weekStart: (data?.weekStart as WeekStartPref) ?? 'sunday',
  }
}

/** Memoised formatter bundle bound to the current user's preferences. */
export function useDateFormat() {
  const prefs = useDatePrefs()
  return useMemo(
    () => ({
      prefs,
      formatDate: (v: DateLike) => formatDateWith(prefs, v),
      formatTime: (v: DateLike) => formatTimeWith(prefs, v),
      formatDateTime: (v: DateLike) => formatDateTimeWith(prefs, v),
      weekStartsOn: weekStartsOnIndex(prefs.weekStart),
    }),
    [prefs.dateFormat, prefs.timeFormat, prefs.weekStart],
  )
}
