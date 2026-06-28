import { http } from '@/lib/http';

// Live streaming (live). Endpoints under /live/api/*. Ingest provider is
// configurable server-side (self-hosted SRS or Cloudflare Stream); the API is
// provider-agnostic.
export interface Stream {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  rtmp_url?: string;
  hls_url?: string;
  dash_url?: string;
  thumbnail_url?: string;
  status?: string;
  visibility?: string;
  viewer_count?: number;
  currentViewers?: number;
  isLive?: boolean;
  is_recording?: boolean;
  started_at?: string;
  created_at?: string;
  [k: string]: unknown;
}

export interface CreateStreamInput {
  title: string;
  description?: string;
  visibility?: 'public' | 'unlisted' | 'private';
}

export interface CreateGroupStreamInput {
  title: string;
  description?: string;
  visibility?: 'public' | 'unlisted' | 'private';
  isRecording?: boolean;
}

export interface StreamPagination {
  total: number;
  limit: number;
  offset: number;
  [k: string]: unknown;
}

export interface ListGroupStreamsParams {
  status?: string;
  visibility?: string;
  limit?: number;
  offset?: number;
}

/**
 * Rewrite a self-hosted SRS playback URL (http://host:8085/live/<key>.m3u8) to
 * the same-origin HTTPS path proxied by nginx (/srs/live/<key>.m3u8), avoiding
 * mixed-content blocking. HTTPS provider URLs (e.g. Cloudflare) pass through.
 */
export function playableHlsUrl(hlsUrl?: string): string | null {
  if (!hlsUrl) return null;
  try {
    const u = new URL(hlsUrl, window.location.origin);
    if (u.protocol === 'http:') return `/srs${u.pathname}`;
    return u.toString();
  } catch {
    return hlsUrl;
  }
}

export const liveApi = {
  listStreams: () => http.get<{ success: boolean; streams: Stream[] }>('/live/api/streams'),
  getStream: (id: string) => http.get<{ success: boolean; stream: Stream }>(`/live/api/streams/${id}`),
  createStream: (input: CreateStreamInput) =>
    http.post<{ success: boolean; stream: Stream }>('/live/api/streams', input),
  startStream: (id: string) =>
    http.post<{ success: boolean; stream: Stream }>(`/live/api/streams/${id}/start`, {}),
  stopStream: (id: string) =>
    http.post<{ success: boolean; stream: Stream }>(`/live/api/streams/${id}/stop`, {}),
  deleteStream: (id: string) => http.del<{ success: boolean }>(`/live/api/streams/${id}`),

  // ── Group-owned streams (Phase 5) ──────────────────────────────────────────
  /** Create a stream owned by a group (group admin/owner only). */
  createGroupStream: (groupId: string, input: CreateGroupStreamInput) =>
    http.post<{ success: boolean; stream: Stream }>(
      `/live/api/groups/${groupId}/streams`,
      input,
    ),
  /** List a group's streams (members). */
  listGroupStreams: (groupId: string, params?: ListGroupStreamsParams) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.visibility) sp.set('visibility', params.visibility);
    if (params?.limit != null) sp.set('limit', String(params.limit));
    if (params?.offset != null) sp.set('offset', String(params.offset));
    const q = sp.toString();
    return http.get<{ success: boolean; streams: Stream[]; pagination: StreamPagination }>(
      `/live/api/groups/${groupId}/streams${q ? `?${q}` : ''}`,
    );
  },
};

// --- Video chat rooms (WebRTC mesh) -----------------------------------------

export interface Room {
  id: string;
  host_id: string;
  name: string;
  description?: string;
  room_code: string;
  is_private?: boolean;
  max_participants?: number;
  current_participant_count?: number;
  status?: string;
  [k: string]: unknown;
}

export interface RoomParticipant {
  id: string;
  user_id: string;
  display_name?: string;
  role?: string;
  socket_id?: string;
  [k: string]: unknown;
}

export interface CreateRoomInput {
  name: string;
  description?: string;
  maxParticipants?: number;
  isPrivate?: boolean;
  password?: string;
}

export interface JoinRoomInput {
  password?: string;
  displayName?: string;
}

export const roomApi = {
  createRoom: (input: CreateRoomInput) =>
    http.post<{ success: boolean; room: Room }>('/live/api/rooms', input),
  getRoomByCode: (code: string) =>
    http.get<{ success: boolean; room: Room }>(`/live/api/rooms/code/${encodeURIComponent(code)}`),
  // The server binds the participant to this socket id (also accepted as the
  // x-socket-id header); the room socket later claims it on `join-room`.
  joinRoom: (id: string, socketId: string, input: JoinRoomInput) =>
    http.post<{ success: boolean; participant: RoomParticipant; room: Room }>(
      `/live/api/rooms/${id}/join?socketId=${encodeURIComponent(socketId)}`,
      input,
    ),
  leaveRoom: (id: string, socketId: string) =>
    http.post<{ success: boolean }>(
      `/live/api/rooms/${id}/leave?socketId=${encodeURIComponent(socketId)}`,
      {},
    ),
};
