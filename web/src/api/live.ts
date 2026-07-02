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

export interface ListStreamsParams {
  status?: string;
  visibility?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

/** An ephemeral live-stream chat message (delivered over the /live socket). */
export interface StreamChatMessage {
  id: string;
  streamId: string;
  userId?: string;
  displayName?: string;
  message: string;
  ts: number;
}

/** A recorded stream or room (VOD). */
export interface Recording {
  id: string;
  stream_id?: string;
  room_id?: string;
  user_id?: string;
  title?: string;
  description?: string;
  hls_url?: string;
  dash_url?: string;
  storage_url?: string;
  thumbnail_url?: string;
  status?: 'processing' | 'ready' | 'failed' | 'deleted';
  duration_seconds?: number;
  file_size_bytes?: number;
  resolution?: string;
  created_at?: string;
  [k: string]: unknown;
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
  listStreams: (params?: ListStreamsParams) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.visibility) sp.set('visibility', params.visibility);
    if (params?.userId) sp.set('userId', params.userId);
    if (params?.limit != null) sp.set('limit', String(params.limit));
    if (params?.offset != null) sp.set('offset', String(params.offset));
    const q = sp.toString();
    return http.get<{ success: boolean; streams: Stream[]; pagination?: StreamPagination }>(
      `/live/api/streams${q ? `?${q}` : ''}`,
    );
  },
  getStream: (id: string) => http.get<{ success: boolean; stream: Stream }>(`/live/api/streams/${id}`),
  getStreamRecordings: (id: string) =>
    http.get<{ success: boolean; recordings: Recording[] }>(`/live/api/streams/${id}/recordings`),
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
  /** How outsiders get in: 'open' = anyone with the code, 'request' = host approval. */
  join_policy?: 'open' | 'request';
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
  getRoomRecordings: (id: string) =>
    http.get<{ success: boolean; recordings: Recording[] }>(`/live/api/rooms/${id}/recordings`),
};

// --- Room collaboration: invites, join requests, shared files, recording -----
// All under /live/api/rooms/:id/*. Host-only endpoints 403 for non-hosts; the
// UI gates them by host_id but still tolerates 403/404 gracefully.

/** A pending/accepted invite the host extended to another user. */
export interface RoomInvite {
  id: string;
  inviteeId: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | string;
  createdAt?: string;
  [k: string]: unknown;
}

/** A request from an outsider to join a request-policy room. */
export interface RoomJoinRequest {
  id: string;
  userId: string;
  status: 'pending' | 'approved' | 'denied' | string;
  createdAt?: string;
  [k: string]: unknown;
}

/** A file attached to a room — either a shared FileVault file or an ephemeral upload. */
export interface RoomFile {
  id: string;
  name: string;
  mimetype?: string;
  size?: number;
  kind: 'vault' | 'ephemeral';
  /** Present for `kind: 'vault'` — the underlying FileVault file id. */
  fileId?: string;
  createdAt?: string;
  [k: string]: unknown;
}

export type RecordingQuality = 'source' | '1080p' | '720p';

export const roomCollabApi = {
  // ── Invites (host) ────────────────────────────────────────────────────────
  listInvites: (roomId: string) =>
    http.get<{ success: boolean; invites: RoomInvite[] }>(`/live/api/rooms/${roomId}/invites`),
  createInvite: (roomId: string, inviteeId: string) =>
    http.post<{ success: boolean; invite: RoomInvite }>(`/live/api/rooms/${roomId}/invites`, {
      inviteeId,
    }),
  revokeInvite: (roomId: string, inviteId: string) =>
    http.del<{ success: boolean }>(`/live/api/rooms/${roomId}/invites/${inviteId}`),

  // ── Join requests ─────────────────────────────────────────────────────────
  /** Requester asks to join a request-policy room. */
  requestToJoin: (roomId: string) =>
    http.post<{ success: boolean; request: RoomJoinRequest }>(
      `/live/api/rooms/${roomId}/join-requests`,
      {},
    ),
  /** Host lists pending join requests. */
  listJoinRequests: (roomId: string) =>
    http.get<{ success: boolean; requests: RoomJoinRequest[] }>(
      `/live/api/rooms/${roomId}/join-requests`,
    ),
  approveJoinRequest: (roomId: string, reqId: string) =>
    http.post<{ success: boolean; request: RoomJoinRequest }>(
      `/live/api/rooms/${roomId}/join-requests/${reqId}/approve`,
      {},
    ),
  denyJoinRequest: (roomId: string, reqId: string) =>
    http.post<{ success: boolean; request: RoomJoinRequest }>(
      `/live/api/rooms/${roomId}/join-requests/${reqId}/deny`,
      {},
    ),

  // ── Files ─────────────────────────────────────────────────────────────────
  listFiles: (roomId: string) =>
    http.get<{ success: boolean; files: RoomFile[] }>(`/live/api/rooms/${roomId}/files`),
  /** Share an existing FileVault file into the room. */
  shareFile: (roomId: string, fileId: string) =>
    http.post<{ success: boolean; file: RoomFile }>(`/live/api/rooms/${roomId}/files/share`, {
      fileId,
    }),
  /** Ephemeral multipart upload (multer field name `file`). */
  uploadFile: (roomId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.post<{ success: boolean; file: RoomFile }>(
      `/live/api/rooms/${roomId}/files/upload`,
      undefined,
      { rawBody: form },
    );
  },
  deleteFile: (roomId: string, fileId: string) =>
    http.del<{ success: boolean }>(`/live/api/rooms/${roomId}/files/${fileId}`),

  // ── Recording ─────────────────────────────────────────────────────────────
  startRecording: (roomId: string, quality?: RecordingQuality) =>
    http.post<{ success: boolean; recording: Recording }>(
      `/live/api/rooms/${roomId}/recording/start`,
      quality ? { quality } : {},
    ),
  stopRecording: (roomId: string) =>
    http.post<{ success: boolean; recording: Recording }>(
      `/live/api/rooms/${roomId}/recording/stop`,
      {},
    ),
  listRecordings: (roomId: string) =>
    http.get<{ success: boolean; recordings: Recording[] }>(`/live/api/rooms/${roomId}/recordings`),
};
