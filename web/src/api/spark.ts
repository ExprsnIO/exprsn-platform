/**
 * Messaging (spark) client. Endpoints under `/spark/api/*`.
 *
 * IMPORTANT: spark has NO REST send/edit — those happen over the `/spark`
 * Socket.IO namespace (`send:message`/`edit:message`; see lib/sparkRealtime.ts).
 * REST is used only for listing conversations/messages and for E2EE key
 * management. Contract verified against services/spark/src/routes/*.
 */
import { http } from '@/lib/http';

export type ConversationType = 'direct' | 'group';
export type ContentType = 'text' | 'image' | 'video' | 'file' | 'audio';
export type ParticipantRole = 'owner' | 'admin' | 'member';

export interface Reaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

/**
 * A structured attachment carried in `Message.attachments` (a plaintext JSON
 * array, even on E2EE messages — see the file-security decision in the MVP
 * features work). The `kind` discriminates render + behaviour:
 *  - image/video/file — FileVault-backed (`fileId`); bytes are bearer-authed.
 *  - call             — a "join video call" card pointing at a /live room.
 *  - link             — a share card (e.g. a timeline post permalink).
 */
export interface ChatAttachment {
  kind: 'image' | 'video' | 'file' | 'call' | 'link';
  /** FileVault fileId for image/video/file kinds. */
  fileId?: string;
  name?: string;
  mimetype?: string;
  size?: number;
  /** Sender-provided alt text for an image attachment (BUG-040). */
  altText?: string;
  /** Poster preview for a video attachment, when available. */
  thumbnailUrl?: string;
  /** call kind. */
  roomId?: string;
  roomCode?: string;
  /** link/share kind. */
  url?: string;
  title?: string;
  subtitle?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  contentType: ContentType;
  encrypted: boolean;
  encryptedContent: string | null;
  senderKeyFingerprint: string | null;
  parentMessageId: string | null;
  attachments: ChatAttachment[];
  mentions: unknown[];
  /** Pin state (surfaced via the enhanced routes). */
  isPinned?: boolean;
  pinnedAt?: string | null;
  edited: boolean;
  editedAt: string | null;
  deleted: boolean;
  deletedAt: string | null;
  readBy: string[];
  createdAt: string;
  updatedAt: string;
  reactions?: Reaction[];
  /** Present only on the live `new:message` socket event. */
  sender?: { id: string; displayName?: string };
}

export interface Participant {
  id: string;
  conversationId: string;
  userId: string;
  role: ParticipantRole;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  active: boolean;
}

export interface ConversationSettings {
  readReceipts?: boolean;
  typingIndicators?: boolean;
  muteNotifications?: boolean;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string | null;
  description: string | null;
  avatar: string | null;
  createdBy: string;
  lastMessageAt: string | null;
  settings: ConversationSettings;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present on the list endpoint (per-user participant projection). */
  userRole?: ParticipantRole;
  lastReadMessageId?: string | null;
  lastReadAt?: string | null;
  /** Last message (limit 1) on the list endpoint. */
  messages?: Message[];
  /** Active participants — present on the detail endpoint. */
  participants?: Participant[];
}

export interface MessagesPage {
  messages: Message[];
  pagination: { page: number; limit: number; hasMore: boolean };
}

// ── E2EE key management ──────────────────────────────────────────────────────

export interface RegisterKeyInput {
  deviceId: string;
  publicKey: string;
  encryptedPrivateKey: string;
}

export interface RegisteredKey {
  keyId: string;
  publicKey: string;
  keyFingerprint: string;
  keyOrigin: 'server' | 'client';
  expiresAt: string | null;
}

export interface OwnKeyMaterial {
  keyId: string;
  deviceId: string;
  publicKey: string;
  encryptedPrivateKey: string;
  keyFingerprint: string;
  keyType: string;
  keyOrigin: 'server' | 'client';
  expiresAt: string | null;
}

export interface PublicKeyInfo {
  keyId: string;
  publicKey: string;
  keyFingerprint: string;
  keyType: string;
}

export const sparkApi = {
  listConversations: () =>
    http.get<{ conversations: Conversation[] }>('/spark/api/conversations'),

  /** Start (or define) a conversation. For a 1:1 DM, type='direct' with a single participant. */
  createConversation: (input: { type: ConversationType; participantIds: string[]; name?: string }) =>
    http.post<{ conversation: Conversation }>('/spark/api/conversations', input),

  getConversation: (id: string) =>
    http.get<{ conversation: Conversation }>(`/spark/api/conversations/${id}`),

  /** Rename / re-describe / re-setting a conversation (admins/owners for groups). */
  updateConversation: (
    id: string,
    body: { name?: string | null; description?: string | null; settings?: ConversationSettings },
  ) => http.put<{ conversation: Conversation }>(`/spark/api/conversations/${id}`, body),

  /** Add a participant to a (group) conversation. */
  addParticipant: (conversationId: string, userId: string) =>
    http.post<{ participant: Participant }>(
      `/spark/api/conversations/${conversationId}/participants`,
      { userId },
    ),

  /** Leave a conversation (soft-removes the caller's participant row). */
  leaveConversation: (id: string) =>
    http.del<{ success: boolean }>(`/spark/api/conversations/${id}`),

  // ── pinned messages (enhanced routes; pin/unpin is admin/owner-gated) ────────
  listPinned: (conversationId: string) =>
    http.get<{ messages: Message[] } | { pinnedMessages: Message[] }>(
      `/spark/api/conversations/${conversationId}/pinned`,
    ),
  pinMessage: (messageId: string) =>
    http.post<{ success: boolean }>(`/spark/api/messages/${messageId}/pin`),
  unpinMessage: (messageId: string) =>
    http.post<{ success: boolean }>(`/spark/api/messages/${messageId}/unpin`),

  listMessages: (conversationId: string, params: { page?: number; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return http.get<MessagesPage>(
      `/spark/api/messages/${conversationId}${qs ? `?${qs}` : ''}`,
    );
  },

  // ── encryption ──
  registerKey: (input: RegisterKeyInput) =>
    http
      .post<{ success: boolean; data: RegisteredKey }>(
        '/spark/api/encryption/keys/generate',
        input,
      )
      .then((r) => r.data),

  /** Caller's own active key material incl. the wrapped private key (404 if none). */
  getMyKey: () =>
    http
      .get<{ success: boolean; data: OwnKeyMaterial }>('/spark/api/encryption/keys/mine')
      .then((r) => r.data),

  /** Map of userId → public key info for the recipients we can encrypt to. */
  batchPublicKeys: (userIds: string[]) =>
    http
      .post<{ success: boolean; data: Record<string, PublicKeyInfo> }>(
        '/spark/api/encryption/keys/public/batch',
        { userIds },
      )
      .then((r) => r.data),

  /** The caller's wrapped content key for a message (404 if not a recipient). */
  getMessageKey: (messageId: string) =>
    http
      .get<{ success: boolean; data: { messageId: string; encryptedKey: string } }>(
        `/spark/api/encryption/messages/${messageId}/keys`,
      )
      .then((r) => r.data.encryptedKey),

  // ── nexus group channels (PLAINTEXT — no E2EE) ──────────────────────────────

  /**
   * List (auto-provisioning if missing) a group's two channels. Each channel is
   * a normal Conversation augmented with `userRole` (the caller's nexus role).
   * Realtime send/receive still flow over the `/spark` socket; these channels
   * are NOT E2E-encrypted.
   */
  listGroupChannels: (groupId: string) =>
    http.get<{ groupId: string; channels: GroupChannels }>(
      `/spark/api/groups/${groupId}/channels`,
    ),

  /**
   * Post a plaintext message to a group channel. The 'announcement' channel
   * requires admin/owner (server returns 403 ANNOUNCEMENT_ADMIN_ONLY otherwise).
   * The server also broadcasts the new message over the `/spark` socket.
   */
  sendGroupChannelMessage: (
    groupId: string,
    channelKind: GroupChannelKind,
    body: { content: string; contentType?: ContentType; mentions?: unknown[] },
  ) =>
    http.post<{ message: Message }>(
      `/spark/api/groups/${groupId}/channels/${channelKind}/messages`,
      body,
    ),
};

// ── group channel types ───────────────────────────────────────────────────────

export type GroupChannelKind = 'chat' | 'announcement';

/** Nexus role of the caller within the group (note: includes 'moderator'). */
export type GroupChannelRole = 'owner' | 'admin' | 'moderator' | 'member';

/** A group channel is a Conversation carrying the caller's nexus role. */
export type GroupChannel = Omit<Conversation, 'userRole'> & { userRole: GroupChannelRole };

export interface GroupChannels {
  chat: GroupChannel;
  announcement: GroupChannel;
}
