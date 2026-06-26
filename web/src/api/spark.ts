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
  attachments: unknown[];
  mentions: unknown[];
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
};
