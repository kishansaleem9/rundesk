import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from './api'

/**
 * §2.8 — the Meetings hub's data.
 *
 * The API for all of this already existed; there was no page. You could record
 * a meeting from the AI panel and then never find it again.
 */
export interface MeetingAttendee {
  id: string
  userId: string | null
  name: string | null
  email: string | null
}

export interface Meeting {
  id: string
  title: string
  startsAt: string | null
  endsAt: string | null
  provider: 'zoom' | 'google_meet' | 'manual'
  joinUrl: string | null
  recordingUrl: string | null
  notes: string | null
  taskId: string | null
  createdById: string | null
  createdAt: string
  attendees: MeetingAttendee[]
}

const base = (workspaceId: string) => `/workspaces/${workspaceId}/meetings`

export function useMeetings(workspaceId: string) {
  return useQuery({
    queryKey: ['meetings', workspaceId],
    queryFn: () => api<Meeting[]>(base(workspaceId)),
    enabled: !!workspaceId,
  })
}

/**
 * Upcoming comes from the SERVER, not from filtering the list here.
 *
 * A browser clock that is wrong — a laptop woken from sleep, a machine in the
 * wrong timezone — would move a meeting between "upcoming" and "past" with
 * nothing to say it had, and someone would simply not be told about a call
 * about to start.
 */
export function useUpcomingMeetings(workspaceId: string) {
  return useQuery({
    queryKey: ['meetings', workspaceId, 'upcoming'],
    queryFn: () => api<Meeting[]>(`${base(workspaceId)}/upcoming`),
    enabled: !!workspaceId,
    // A countdown that is an hour stale is worse than none.
    refetchInterval: 60_000,
  })
}

export function useAskMeetings(workspaceId: string) {
  return useMutation({
    mutationFn: (question: string) =>
      api<{ answer: string; grounded: boolean }>(`${base(workspaceId)}/ask`, {
        method: 'POST',
        body: { question },
      }),
  })
}

/**
 * "in 5m" — her proximity badge.
 *
 * Rounded down deliberately: a meeting 119 seconds away reading "in 2m" invites
 * someone to finish a sentence first. "in 1m" does not.
 */
export function untilLabel(startsAt: string | null, now: number = Date.now()): string | null {
  if (!startsAt) return null
  const ms = new Date(startsAt).getTime() - now
  if (Number.isNaN(ms)) return null
  if (ms < 0) return null
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `in ${hours}h`
  return `in ${Math.floor(hours / 24)}d`
}

/** Whether the Join pill should be live — her frame shows it before the hour. */
export function isJoinable(startsAt: string | null, now: number = Date.now()): boolean {
  if (!startsAt) return false
  const ms = new Date(startsAt).getTime() - now
  // Ten minutes before, and for an hour after it started: people join late, and
  // a Join button that vanishes on the stroke of the hour is useless to them.
  return ms <= 10 * 60_000 && ms > -60 * 60_000
}
