import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getRealtimeSocket } from './realtime'

/**
 * §2.8 SyncUp — the peer connections behind a call.
 *
 * Mesh, not an SFU: every participant connects directly to every other one.
 * That is why this needs no media server, and it is also its ceiling — each
 * person uploads their stream once per peer, so a mesh is fine for a handful
 * and hopeless for a room. `MESH_LIMIT` is where we say so out loud instead of
 * letting a nine-person call quietly turn to slideshow.
 */
export const MESH_LIMIT = 6

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
    setPeers((prev) => prev.filter((p) => p.userId !== peerId))
  }, [])

  const connectTo = useCallback(
    async (peerId: string) => {
      if (!callId || !localStream) return
      if (connections.current.has(peerId)) return
      const socket = getRealtimeSocket()
      const pc = new RTCPeerConnection({ iceServers: servers })
      connections.current.set(peerId, pc)

      for (const track of localStream.getTracks()) pc.addTrack(track, localStream)

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
        if (pc.connectionState === 'failed') {
          // Recorded rather than silently dropped, so the UI can say WHY a
          // tile never appeared — usually a network that needs TURN.
          setFailedPeers((prev) => (prev.includes(peerId) ? prev : [...prev, peerId]))
          dropPeer(peerId)
        }
      }

      if (shouldInitiate(myUserId, peerId)) {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('call.signal', { callId, to: peerId, signal: { kind: 'offer', sdp: offer } })
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

      let pc = connections.current.get(peerId)
      if (!pc && signal.kind === 'offer') {
        await connectTo(peerId)
        pc = connections.current.get(peerId)
      }
      if (!pc) return

      try {
        if (signal.kind === 'offer' && signal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.emit('call.signal', { callId, to: peerId, signal: { kind: 'answer', sdp: answer } })
        } else if (signal.kind === 'answer' && signal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
        } else if (signal.kind === 'ice' && signal.candidate) {
          // Candidates can arrive before the description they belong to.
          // Adding one then throws, and it is genuinely nothing to worry
          // about — the connection completes on the ones that follow.
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {})
        }
      } catch {
        // A malformed or out-of-order signal must not take the call down.
      }
    }

    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
    }
  }, [callId, connectTo])

  // Open a connection to everyone who is here, and drop anyone who left.
  useEffect(() => {
    if (!callId || !localStream) return
    const others = peerIds.filter((id) => id !== myUserId)
    for (const id of others.slice(0, MESH_LIMIT)) void connectTo(id)
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
    tooManyPeers: peerIds.length > MESH_LIMIT,
  }
}
