/**
 * §2.8 — the decisions a call makes, pulled out of the effects that made them.
 *
 * An adversarial audit of the first cut of SyncUp found twelve defects. Two
 * pure functions in this feature had tests (`shouldInitiate`, `MESH_LIMIT`) and
 * neither of them was wrong. Everything that WAS wrong lived inside a
 * `useEffect` or a ref, where nothing could reach it: a preview stream stopped
 * by the dialog that had just handed it over, an end-of-call branch that could
 * never run, candidates dropped because they arrived a beat early.
 *
 * So the decisions live here now. None of them needs a browser to be right, and
 * every one of them is the kind that fails silently — a black tile, a frozen
 * participant list, a call that never connects and never says why.
 */

/** Anything with a `.current` — a React ref, or a plain object in a test. */
export interface Holder<T> {
  current: T | null
}

/**
 * Take ownership of what a ref is holding.
 *
 * The pre-join dialog passed `streamRef.current` straight to the call and left
 * the ref pointing at it. Its own unmount cleanup — which runs in the same
 * commit that mounts the call, before the call's effects — then stopped every
 * track of the stream the call had just been given. The camera light went out,
 * `addTrack` was handed tracks already in state 'ended', and both people sat
 * looking at a connected call containing nothing, with no error anywhere.
 *
 * Emptying the ref as part of handing the value over is the whole fix: after
 * this, a cleanup that stops `ref.current` stops a preview that no longer
 * exists.
 */
export function takeStream<T>(ref: Holder<T>): T | null {
  const held = ref.current
  ref.current = null
  return held
}

/**
 * Has the call we are in ended under us?
 *
 * The server's "what is live in this channel" query filters on `endedAt is
 * null`, so a call it returns can never carry an end time. The original check
 * asked exactly that — `live.endedAt` — behind a guard that had already
 * returned when `live` was null. Both halves were unreachable, so nobody was
 * ever hung up: the host pressed "End for everyone" and everyone else stayed in
 * a full-screen call that no longer existed, cameras still on.
 *
 * What the absence of our call actually means is that it is over. The only
 * thing to be careful of is the moment just after joining, when the query has
 * not answered yet — hanging up there would end the call as it started.
 */
export function callHasEnded(state: {
  /** The call this client believes it is in. */
  inCallId: string | null
  /** The live call in that call's channel — null for "there is none". */
  liveId: string | null
  /** Whether that query has actually answered yet. */
  settled: boolean
}): boolean {
  if (!state.inCallId) return false
  if (!state.settled) return false
  return state.liveId !== state.inCallId
}

/**
 * Is this call bigger than a mesh can carry?
 *
 * Counts PEERS, not people in the room. Counting participants meant the amber
 * "large call" warning appeared at seven — which is six peers, exactly what the
 * mesh handles, with nothing at all wrong.
 */
export function isLargeCall(peerIds: string[], myUserId: string, limit: number): boolean {
  return peerIds.filter((id) => id !== myUserId).length > limit
}

/**
 * Which video track should a NEW peer connection carry?
 *
 * While sharing a screen, the share is a separate MediaStream that never joins
 * the camera's. A connection built during a share therefore has to be told, or
 * it adds the camera: the peer who joined ten seconds late saw your face while
 * everybody else saw your screen, and nothing on either side hinted at the
 * disagreement.
 */
export function outgoingVideoTrack<T>(sharing: T | null, camera: T | null | undefined): T | null {
  return sharing ?? camera ?? null
}

/**
 * Should this ICE candidate be held rather than applied?
 *
 * A candidate is only meaningful once the description it belongs to is set, and
 * they routinely arrive first: the offerer's `onicecandidate` starts firing
 * during `setLocalDescription`, before the offer has even been sent. The
 * original code applied it anyway and swallowed the throw. On a home network
 * the candidates that follow cover for the loss; on a corporate one the
 * discarded candidate was the relay, and the call just never connected — the
 * user seeing nothing but the "your network may need TURN" badge.
 */
export function shouldBufferIce(pc: { remoteDescription: unknown } | null | undefined): boolean {
  return !pc || !pc.remoteDescription
}

/** Hold a candidate until there is somewhere to put it. */
export function queueIce<C>(queues: Map<string, C[]>, peerId: string, candidate: C): void {
  const waiting = queues.get(peerId) ?? []
  waiting.push(candidate)
  queues.set(peerId, waiting)
}

/** Take everything held for a peer, exactly once. */
export function drainIce<C>(queues: Map<string, C[]>, peerId: string): C[] {
  const waiting = queues.get(peerId) ?? []
  queues.delete(peerId)
  return waiting
}

/**
 * May we rebuild this peer connection after a failure?
 *
 * Bounded, because a route that is genuinely dead fails again immediately and
 * an unbounded rebuild is a loop that burns the machine while showing nothing.
 * When the budget runs out the failed badge stands, which is the honest answer.
 */
export function canResetPeer(attempts: number, max: number): boolean {
  return attempts < max
}
