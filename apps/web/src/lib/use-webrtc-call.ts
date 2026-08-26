import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getRealtimeSocket } from './realtime'
import {
  canResetPeer,
  drainIce,
  isLargeCall,
  outgoingVideoTrack,
  queueIce,
  shouldBufferIce,
} from './call-lifecycle'

/**
 * §2.8 SyncUp — the peer connections behind a call.
 *
 * Mesh, not an SFU: every participant connects directly to every other one.
 * That is why this needs no media server, and it is also its ceiling — each
 * person uploads their stream once per peer, so a mesh is fine for a handful
 * and hopeless for a room. `MESH_LIMIT` is where we say so out loud instead of
 * letting a nine-person call quietly turn to slideshow.
 *
 * It is a WARNING threshold, not a cap. Truncating each client's peer list
 * independently looked like a safety valve and was worse than none: with eight
 * people, each client dropped a different peer, so who could see whom came out
 * different on every machine and depended on how the ids happened to sort. A
 * mesh that degrades for everybody equally is at least a mesh you can reason
 * about; the real answer above this size is an SFU, not a cleverer slice.
 */
export const MESH_LIMIT = 6

/** How many times a peer connection is rebuilt after failing before giving up. */
const MAX_RESETS = 3

/**
 * Who calls whom.
 *
 * Both peers learn about each other at the same moment, so if both offered,
 * they would collide — two half-open connections, neither completing, and
 * nothing on screen to explain it. Comparing ids gives a stable, symmetric
 * answer both sides compute identically without another round trip.
 */
export function shouldInitiate(myId: string, peerId: string): boolean {
  return myId < peerId
}

/**
 * ICE servers.
 *
 * STUN alone is enough for most home and office networks. It is NOT enough
 * behind symmetric NAT or strict corporate firewalls, which is what TURN is
 * for — and TURN costs money to run, so it stays optional and configured.
 * `hasTurn` is exported so the UI can say "your network may block this" rather
 * than presenting a connection that will simply never establish.
 */
export function iceServers(): { servers: RTCIceServer[]; hasTurn: boolean } {
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined
  const turnUser = import.meta.env.VITE_TURN_USERNAME as string | undefined
  const turnPass = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ]
  if (turnUrl && turnUser && turnPass) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnPass })
    return { servers, hasTurn: true }
  }
  return { servers, hasTurn: false }
}

export interface PeerStream {
  userId: string
  stream: MediaStream
}

export interface CallMediaState {
  micOn: boolean
  cameraOn: boolean
  sharingScreen: boolean
}

/**
 * Drive one call.
 *
 * `localStream` is passed IN rather than acquired here, because the pre-join
 * dialog already asked for the camera and picked the devices — asking twice
 * would prompt twice and hand back a different stream than the one previewed.
 */
export function useWebRtcCall(options: {
  callId: string | null
  myUserId: string
  peerIds: string[]
  localStream: MediaStream | null
}) {
  const { callId, myUserId, peerIds, localStream } = options
  const [peers, setPeers] = useState<PeerStream[]>([])
  const [failedPeers, setFailedPeers] = useState<string[]>([])
  const connections = useRef(new Map<string, RTCPeerConnection>())
  const { servers, hasTurn } = useMemo(() => iceServers(), [])

  /**
   * Candidates that arrived before there was anywhere to put them.
   *
   * The offerer's `onicecandidate` starts firing during setLocalDescription —
   * before the offer itself has even been emitted — so on a fast link the
   * first candidates routinely beat the description they belong to. Adding one
   * then throws, and throwing one away is throwing away a route: on a home
   * network the later candidates cover for it, but on a restrictive one the
   * discarded candidate was the relay, and the call simply never connects.
   */
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>())

  /**
   * The video track currently going out — the camera, or the screen while
   * sharing. Held here because a peer who joins mid-share must be sent the
   * share, and `connectTo` has no idea the surface above it is sharing.
   */
  const outgoingVideo = useRef<MediaStreamTrack | null>(null)

  /** Rebuild attempts per peer, so a genuinely dead route stops looping. */
  const resets = useRef(new Map<string, number>())

  /** Tear one peer down. Idempotent: called on leave, on failure, and on unmount. */
  const dropPeer = useCallback((peerId: string) => {
    const pc = connections.current.get(peerId)
    if (pc) {
      // Handlers first, or teardown fires state-change events that try to
      // rebuild the very connection being closed.
      pc.onicecandidate = null
      pc.ontrack = null
      pc.onconnectionstatechange = null
      pc.close()
    }
    connections.current.delete(peerId)
    pendingIce.current.delete(peerId)
    setPeers((prev) => prev.filter((p) => p.userId !== peerId))
  }, [])

  /** Hand over every candidate that was waiting for this description. */
  const flushIce = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    for (const candidate of drainIce(pendingIce.current, peerId)) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
    }
  }, [])

  const connectTo = useCallback(
    async (peerId: string) => {
      if (!callId || !localStream) return
      if (connections.current.has(peerId)) return
      const socket = getRealtimeSocket()
      const pc = new RTCPeerConnection({ iceServers: servers })
      connections.current.set(peerId, pc)

      // Audio always comes from the microphone; video is whatever is currently
      // going out. Blindly sending localStream's camera track here is what made
      // a peer who joined during a screen share see a face while everyone else
      // saw the screen.
      for (const track of localStream.getAudioTracks()) pc.addTrack(track, localStream)
      const video = outgoingVideoTrack(outgoingVideo.current, localStream.getVideoTracks()[0])
      if (video) pc.addTrack(video, localStream)

      pc.onicecandidate = (event) => {
        if (!event.candidate) return
        socket.emit('call.signal', {
          callId,
          to: peerId,
          signal: { kind: 'ice', candidate: event.candidate.toJSON() },
        })
      }

      pc.ontrack = (event) => {
        const [stream] = event.streams
        if (!stream) return
        setPeers((prev) => {
          // Replace rather than append: a renegotiation (screen share starting)
          // fires ontrack again for a peer already on screen, and appending
          // would show them twice.
          const without = prev.filter((p) => p.userId !== peerId)
          return [...without, { userId: peerId, stream }]
        })
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          // The route came good. Clearing this matters: the amber "your network
          // may need TURN" badge used to appear once and then stay for the rest
          // of the call, long after the peer was back.
          resets.current.delete(peerId)
          setFailedPeers((prev) => (prev.includes(peerId) ? prev.filter((id) => id !== peerId) : prev))
          return
        }
        if (pc.connectionState !== 'failed') return

        // Recorded rather than silently dropped, so the UI can say WHY a tile
        // never appeared — usually a network that needs TURN.
        setFailedPeers((prev) => (prev.includes(peerId) ? prev : [...prev, peerId]))

        // Rebuilding only on this side leaves whichever of us is not the
        // designated offerer waiting for an offer the other never sends, and
        // the two ends can disagree about being connected at all. Telling the
        // peer to drop too means both rebuild, and `shouldInitiate` picks the
        // same offerer it always would.
        const attempts = resets.current.get(peerId) ?? 0
        if (canResetPeer(attempts, MAX_RESETS)) {
          resets.current.set(peerId, attempts + 1)
          socket.emit('call.signal', { callId, to: peerId, signal: { kind: 'reset' } })
        }
        dropPeer(peerId)
      }

      if (shouldInitiate(myUserId, peerId)) {
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          socket.emit('call.signal', { callId, to: peerId, signal: { kind: 'offer', sdp: offer } })
        } catch {
          // The connection was closed while the offer was in flight — the peer
          // left, or the call ended. Left registered it would sit half-built
          // forever, because connectTo returns early for a peer it already has.
          dropPeer(peerId)
        }
      }
    },
    [callId, localStream, myUserId, servers, dropPeer],
  )

  // Incoming signalling.
  useEffect(() => {
    if (!callId) return
    const socket = getRealtimeSocket()

    const onEvent = async (event: {
      type?: string
      callId?: string
      from?: string
      signal?: { kind?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
    }) => {
      if (event?.type !== 'call.signal' || event.callId !== callId || !event.from) return
      const peerId = event.from
      const signal = event.signal
      if (!signal) return

      // The peer's connection failed and it is rebuilding. Drop ours too, so
      // both sides start clean and the usual offerer offers.
      if (signal.kind === 'reset') {
        dropPeer(peerId)
        return
      }

      // A candidate for a peer we have not built yet is kept, not discarded:
      // it may be the only relay route, and the connection it belongs to is
      // about to exist.
      if (signal.kind === 'ice' && signal.candidate) {
        const pc = connections.current.get(peerId)
        if (shouldBufferIce(pc)) {
          queueIce(pendingIce.current, peerId, signal.candidate)
          return
        }
        await pc!.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {})
        return
      }

      let pc = connections.current.get(peerId)
      if (!pc && signal.kind === 'offer') {
        await connectTo(peerId)
        pc = connections.current.get(peerId)
      }
      if (!pc) return

      try {
        if (signal.kind === 'offer' && signal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
          await flushIce(peerId, pc)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.emit('call.signal', { callId, to: peerId, signal: { kind: 'answer', sdp: answer } })
        } else if (signal.kind === 'answer' && signal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
          await flushIce(peerId, pc)
        }
      } catch {
        // A malformed or out-of-order signal must not take the call down.
      }
    }

    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
    }
  }, [callId, connectTo, dropPeer, flushIce])

  // Open a connection to everyone who is here, and drop anyone who left.
  useEffect(() => {
    if (!callId || !localStream) return
    const others = peerIds.filter((id) => id !== myUserId)
    // Everyone, not a slice: see MESH_LIMIT above. A partial mesh made the
    // call's shape depend on which client you asked.
    for (const id of others) void connectTo(id)
    for (const id of [...connections.current.keys()]) {
      if (!others.includes(id)) dropPeer(id)
    }
  }, [callId, localStream, peerIds, myUserId, connectTo, dropPeer])

  // Close everything when the call ends or the component goes away. Without
  // this the camera light stays on after hanging up, which people notice and
  // rightly find alarming.
  useEffect(() => {
    const open = connections.current
    return () => {
      for (const id of [...open.keys()]) {
        const pc = open.get(id)
        if (pc) {
          pc.onicecandidate = null
          pc.ontrack = null
          pc.onconnectionstatechange = null
          pc.close()
        }
      }
      open.clear()
    }
  }, [])

  /**
   * Swap the outgoing video track — screen share on, or back to the camera.
   *
   * `replaceTrack` on the existing sender, NOT a new connection: renegotiating
   * would drop and re-establish every peer, and everyone would see a black
   * tile for a second or two each time somebody shared.
   */
  const replaceVideoTrack = useCallback(async (track: MediaStreamTrack | null) => {
    // Recorded before the swap, so a peer who connects a moment later is built
    // with the screen rather than the camera.
    outgoingVideo.current = track
    for (const pc of connections.current.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
      if (sender) await sender.replaceTrack(track).catch(() => {})
    }
  }, [])

  return {
    peers,
    failedPeers,
    hasTurn,
    replaceVideoTrack,
    // Peers, not participants. Counting the local user made the "large call"
    // badge appear at seven people, when seven is six peers — exactly the
    // number the mesh handles, with nothing wrong.
    tooManyPeers: isLargeCall(peerIds, myUserId, MESH_LIMIT),
  }
}
