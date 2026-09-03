import { create } from 'zustand'

/**
 * §G14-8 [20:12] — the call that outlives the page it started on.
 *
 * "Minimise" exists so you can browse while you talk, and it did not work:
 * `ChannelCall` owned both the header button AND the live call, and it was
 * mounted by the chat page. Clicking through to a task unmounted it, its
 * cleanup stopped every track and left the call, and the picture-in-picture
 * dock went with it. The component's own comment claimed a call "survives
 * navigating around the workspace"; the mount point said otherwise, and the
 * mount point wins.
 *
 * The two halves want to live in different places:
 *
 *   · the header button is about the channel ON SCREEN — it belongs to the
 *     chat page and should die with it;
 *   · the live call is about the person, not the page, and belongs to the
 *     shell.
 *
 * This is the seam between them. The page raises an intent; the shell-level
 * host acts on it and publishes back what is in progress, so page chrome can
 * still say "you are already in one" without owning it.
 *
 * Not persisted, deliberately. A MediaStream cannot survive a reload and
 * neither can a peer connection, so a stored call id would only describe one
 * that is already gone — and the server's own live-call query is the thing that
 * knows the truth after a refresh.
 */

/** What a page asks the shell to do. `callId` absent means "start one". */
export type CallJoinIntent = {
  channelId: string
  callId?: string
  /**
   * Whether recording may be offered, decided by the channel this call is in.
   *
   * Carried on the intent rather than read live by the host: once you are in a
   * call and have browsed away, the "selected channel" is no longer the one you
   * are talking in, and reading it then would answer about the wrong room.
   */
  canRecord: boolean
}

/**
 * A leave raised from a page — the call card's Leave button.
 *
 * Carries the id because the CARD knows it and local state may not: after a
 * page refresh the server still lists you as present while nothing in the
 * browser remembers which call that was, so a Leave that read only local state
 * told the server nothing and left you listed as present forever.
 */
export type CallLeaveIntent = { callId: string }

type CallStore = {
  /** Raised by a page, consumed once by the host. */
  intent: CallJoinIntent | null
  /** A leave raised by a page, consumed once by the host. */
  leaveIntent: CallLeaveIntent | null
  /** The call in progress, mirrored for page chrome. Null when not in one. */
  activeCallId: string | null
  /**
   * The channel it is in — nullable, because a call need not have one. Meetings
   * start calls that belong to no channel, and a store that insisted on a
   * string would have to invent one.
   */
  activeChannelId: string | null
  requestJoin: (intent: CallJoinIntent) => void
  requestLeave: (callId: string) => void
  clearIntent: () => void
  clearLeaveIntent: () => void
  setActive: (call: { id: string; channelId: string | null } | null) => void
}

export const useCallStore = create<CallStore>((set) => ({
  intent: null,
  leaveIntent: null,
  activeCallId: null,
  activeChannelId: null,
  requestJoin: (intent) => set({ intent }),
  requestLeave: (callId) => set({ leaveIntent: { callId } }),
  clearIntent: () => set({ intent: null }),
  clearLeaveIntent: () => set({ leaveIntent: null }),
  setActive: (call) =>
    set({ activeCallId: call?.id ?? null, activeChannelId: call?.channelId ?? null }),
}))
