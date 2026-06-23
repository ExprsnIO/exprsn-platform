/**
 * useWebRtcRoom — full-mesh WebRTC video chat over the `/live` Socket.IO namespace.
 *
 * Topology: every participant holds one RTCPeerConnection per other participant
 * (fine for small rooms; the backend caps rooms at 50 but a mesh is comfortable
 * to ~8). The newcomer initiates offers to everyone already present
 * (`existing-participants`); peers already in the room wait for that offer
 * (`participant-joined` is informational only). All signaling events
 * (`offer`/`answer`/`ice-candidate`) require a validated CA bearer server-side
 * (SP-7) — the realtime layer sends it in the handshake automatically.
 *
 * Lifecycle: acquire local media → connect socket → register the participant via
 * the authed POST /join API (binding our socket id) → emit `join-room`. On
 * teardown we emit `leave-room`, close peers, stop tracks, and call the leave API.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { NS, connect, disconnect } from '@/lib/realtime';
import { roomApi, type JoinRoomInput } from '@/api/live';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export interface RemotePeer {
  socketId: string;
  userId?: string;
  displayName?: string;
  stream?: MediaStream;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
}

export type RoomStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface UseWebRtcRoomResult {
  status: RoomStatus;
  error: string | null;
  localStream: MediaStream | null;
  peers: RemotePeer[];
  audioEnabled: boolean;
  videoEnabled: boolean;
  toggleAudio: () => void;
  toggleVideo: () => void;
  leave: () => void;
}

/**
 * Drive a room session. Pass a null roomId to stay idle (e.g. while in the
 * lobby). The hook starts as soon as a roomId + displayName are provided.
 */
export function useWebRtcRoom(
  roomId: string | null,
  opts: { displayName: string; password?: string },
): UseWebRtcRoomResult {
  const { displayName, password } = opts;

  const [status, setStatus] = useState<RoomStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  // Mutable refs so the socket handlers always see live state without re-binding.
  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const metaRef = useRef<Map<string, Omit<RemotePeer, 'stream' | 'isAudioEnabled' | 'isVideoEnabled'>>>(
    new Map(),
  );
  const leftRef = useRef(false);

  // Reflect the peer ref Map into React state for rendering.
  const syncPeers = useCallback(() => {
    setPeers((prev) => {
      const byId = new Map(prev.map((p) => [p.socketId, p]));
      const next: RemotePeer[] = [];
      for (const socketId of peersRef.current.keys()) {
        const meta = metaRef.current.get(socketId);
        const existing = byId.get(socketId);
        next.push({
          socketId,
          userId: meta?.userId,
          displayName: meta?.displayName,
          stream: existing?.stream,
          isAudioEnabled: existing?.isAudioEnabled ?? true,
          isVideoEnabled: existing?.isVideoEnabled ?? true,
        });
      }
      return next;
    });
  }, []);

  const setPeerStream = useCallback((socketId: string, stream: MediaStream) => {
    setPeers((prev) => {
      const found = prev.find((p) => p.socketId === socketId);
      if (found) return prev.map((p) => (p.socketId === socketId ? { ...p, stream } : p));
      const meta = metaRef.current.get(socketId);
      return [
        ...prev,
        {
          socketId,
          userId: meta?.userId,
          displayName: meta?.displayName,
          stream,
          isAudioEnabled: true,
          isVideoEnabled: true,
        },
      ];
    });
  }, []);

  // Create (or fetch) the peer connection for a given remote socket id.
  const ensurePeer = useCallback(
    (peerSocketId: string): RTCPeerConnection => {
      let pc = peersRef.current.get(peerSocketId);
      if (pc) return pc;

      pc = new RTCPeerConnection(ICE_SERVERS);

      // Publish our local tracks to this peer.
      const local = localStreamRef.current;
      if (local) {
        for (const track of local.getTracks()) pc.addTrack(track, local);
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          socketRef.current?.emit('ice-candidate', {
            to: peerSocketId,
            candidate: ev.candidate,
          });
        }
      };

      pc.ontrack = (ev) => {
        setPeerStream(peerSocketId, ev.streams[0]);
      };

      pc.onconnectionstatechange = () => {
        if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) {
          // Leave cleanup to participant-left / leave(); just stop tracking a dead pc.
        }
      };

      peersRef.current.set(peerSocketId, pc);
      syncPeers();
      return pc;
    },
    [setPeerStream, syncPeers],
  );

  const closePeer = useCallback(
    (peerSocketId: string) => {
      const pc = peersRef.current.get(peerSocketId);
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
      }
      peersRef.current.delete(peerSocketId);
      metaRef.current.delete(peerSocketId);
      setPeers((prev) => prev.filter((p) => p.socketId !== peerSocketId));
    },
    [],
  );

  const leave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;

    const socket = socketRef.current;
    if (socket && roomId) {
      socket.emit('leave-room', { roomId });
      // Best-effort server-side participant teardown.
      void roomApi.leaveRoom(roomId, socket.id ?? '').catch(() => undefined);
    }

    for (const id of Array.from(peersRef.current.keys())) closePeer(id);

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    if (socket) {
      socket.off();
      disconnect(NS.live);
    }
    socketRef.current = null;
    setStatus('idle');
  }, [roomId, closePeer]);

  useEffect(() => {
    if (!roomId || !displayName) return;

    leftRef.current = false;
    let cancelled = false;
    setStatus('connecting');
    setError(null);

    const run = async () => {
      // 1) Local media first — fail early with a clear message if denied.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        if (!cancelled) {
          setError('Camera/microphone access is required to join the room.');
          setStatus('error');
        }
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);

      // 2) Open the /live namespace (bearer goes in the handshake).
      const socket = connect(NS.live);
      socketRef.current = socket;

      const onExisting = ({ participants }: { participants: Array<Record<string, unknown>> }) => {
        // We are the newcomer → initiate an offer to everyone already here.
        for (const p of participants) {
          const peerSocketId = String(p.socketId);
          metaRef.current.set(peerSocketId, {
            socketId: peerSocketId,
            userId: p.userId ? String(p.userId) : undefined,
            displayName: p.displayName ? String(p.displayName) : undefined,
          });
          const pc = ensurePeer(peerSocketId);
          void (async () => {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { to: peerSocketId, offer });
          })();
        }
        syncPeers();
      };

      const onParticipantJoined = ({ participant }: { participant: Record<string, unknown> }) => {
        // Informational: they will send us the offer. Record metadata so their
        // tile is labelled when their offer/track arrives.
        if (participant?.socketId) {
          metaRef.current.set(String(participant.socketId), {
            socketId: String(participant.socketId),
            userId: participant.userId ? String(participant.userId) : undefined,
            displayName: participant.displayName ? String(participant.displayName) : undefined,
          });
        }
      };

      const onOffer = async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
        const pc = ensurePeer(from);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { to: from, answer });
      };

      const onAnswer = async ({ from, answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
        const pc = peersRef.current.get(from);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
      };

      const onIce = async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
        const pc = peersRef.current.get(from);
        if (pc && candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {
            /* ignore late/duplicate candidates */
          }
        }
      };

      const onParticipantLeft = ({ socketId }: { socketId: string }) => closePeer(socketId);

      const onStateChanged = ({
        socketId,
        state,
      }: {
        socketId: string;
        state: { isAudioEnabled?: boolean; isVideoEnabled?: boolean };
      }) => {
        setPeers((prev) =>
          prev.map((p) =>
            p.socketId === socketId
              ? {
                  ...p,
                  isAudioEnabled: state.isAudioEnabled ?? p.isAudioEnabled,
                  isVideoEnabled: state.isVideoEnabled ?? p.isVideoEnabled,
                }
              : p,
          ),
        );
      };

      socket.on('existing-participants', onExisting);
      socket.on('participant-joined', onParticipantJoined);
      socket.on('offer', onOffer);
      socket.on('answer', onAnswer);
      socket.on('ice-candidate', onIce);
      socket.on('participant-left', onParticipantLeft);
      socket.on('participant-state-changed', onStateChanged);

      // 3) Once connected we have a socket id → register the participant via the
      // authed API, then enter the signaling room.
      const enter = async () => {
        if (cancelled || leftRef.current) return;
        try {
          const input: JoinRoomInput = { displayName, password };
          await roomApi.joinRoom(roomId, socket.id ?? '', input);
          socket.emit('join-room', { roomId });
          setStatus('connected');
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Failed to join room');
            setStatus('error');
          }
        }
      };

      if (socket.connected) {
        void enter();
      } else {
        socket.once('connect', () => void enter());
      }
    };

    void run();

    return () => {
      cancelled = true;
      leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, displayName, password]);

  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !audioEnabled;
    stream.getAudioTracks().forEach((t) => (t.enabled = next));
    setAudioEnabled(next);
    if (roomId) socketRef.current?.emit('update-participant-state', { roomId, state: { audioEnabled: next } });
  }, [audioEnabled, roomId]);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !videoEnabled;
    stream.getVideoTracks().forEach((t) => (t.enabled = next));
    setVideoEnabled(next);
    if (roomId) socketRef.current?.emit('update-participant-state', { roomId, state: { videoEnabled: next } });
  }, [videoEnabled, roomId]);

  return {
    status,
    error,
    localStream,
    peers,
    audioEnabled,
    videoEnabled,
    toggleAudio,
    toggleVideo,
    leave,
  };
}
