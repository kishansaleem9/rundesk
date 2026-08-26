import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

/** §2.8 SyncUp — the call's lifecycle, as the browser sees it. */
export interface CallParticipant {
  userId: string
  joinedAt: string
  leftAt: string | null
  wasRecorded: boolean
  name: string | null
  email: string | null
  avatarUrl: string | null
}

export interface Call {
  id: string
  workspaceId: string
  channelId: string | null
  startedById: string
  title: string | null
  startedAt: string
  endedAt: string | null
  recording: boolean
  recordingStartedAt: string | null
  meetingId: string | null
  participants: CallParticipant[]
}

const base = (workspaceId: string) => `/workspaces/${workspaceId}/calls`

/**
 * Is there a call happening in this channel?
 *
 * Polled as well as pushed. The realtime event is the fast path, but a tab
 * that was asleep when the call started would otherwise show no call at all,
 * and "join the call" is exactly the thing you come back to a tab for.
 */
export function useLiveCall(workspaceId: string, channelId: string | null) {
  return useQuery({
    queryKey: ['call', workspaceId, channelId],
    queryFn: () => api<Call | null>(`${base(workspaceId)}/live?channelId=${channelId}`),
    enabled: !!workspaceId && !!channelId,
    refetchInterval: 20_000,
  })
}

export function useCallActions(workspaceId: string) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['call', workspaceId] })
  return {
    start: (input: { channelId?: string; title?: string }) =>
      api<Call>(base(workspaceId), { method: 'POST', body: input }).then((c) => (refresh(), c)),
    join: (callId: string) =>
      api<Call>(`${base(workspaceId)}/${callId}/join`, { method: 'POST' }).then((c) => (refresh(), c)),
    leave: (callId: string) =>
      api(`${base(workspaceId)}/${callId}/leave`, { method: 'POST' }).then((r) => (refresh(), r)),
    end: (callId: string) =>
      // `pending` means the id is coming: somebody else won the race to end
      // this call and is still writing the record.
      api<{ meetingId: string | null; pending?: boolean }>(`${base(workspaceId)}/${callId}/end`, {
        method: 'POST',
      }).then(
        (r) => (refresh(), r),
      ),
    setRecording: (callId: string, recording: boolean) =>
      api<{ recording: boolean }>(`${base(workspaceId)}/${callId}/recording`, {
        method: 'POST',
        body: { recording },
      }).then((r) => (refresh(), r)),
  }
}

export function useCallRecordingMutation(workspaceId: string, callId: string | null) {
  const actions = useCallActions(workspaceId)
  return useMutation({
    mutationFn: (recording: boolean) => {
      if (!callId) throw new Error('No call')
      return actions.setRecording(callId, recording)
    },
  })
}

/** Everyone still in the call — a row with `leftAt` set is history, not presence. */
export function presentIn(call: Call | null | undefined): CallParticipant[] {
  return (call?.participants ?? []).filter((p) => !p.leftAt)
}
