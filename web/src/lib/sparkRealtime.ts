/**
 * Typed wrapper over the `/spark` Socket.IO namespace. Event + payload names
 * mirror services/spark/src/socket/index.js EXACTLY — do not rename.
 *
 * Sending/editing messages happens here (not REST). The single Manager and
 * lazy connect/disconnect live in lib/realtime.ts.
 */
import { connect, namespace, NS } from './realtime';
import type { Message } from '@/api/spark';

// ── client → server ──────────────────────────────────────────────────────────

export interface SendMessagePayload {
  conversationId: string;
  encrypted: true;
  encryptedContent: string;
  senderKeyFingerprint: string;
  recipientKeys: Array<{ userId: string; encryptedKey: string }>;
  contentType?: string;
  parentMessageId?: string | null;
}

export interface EditMessagePayload {
  messageId: string;
  encryptedContent: string;
  senderKeyFingerprint: string;
  recipientKeys: Array<{ userId: string; encryptedKey: string }>;
}

export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

interface ClientEvents {
  'join:conversation': (conversationId: string) => void;
  'leave:conversation': (conversationId: string) => void;
  'send:message': (payload: SendMessagePayload) => void;
  'edit:message': (payload: EditMessagePayload) => void;
  'delete:message': (payload: { messageId: string }) => void;
  'typing:start': (conversationId: string) => void;
  'typing:stop': (conversationId: string) => void;
  'mark:read': (payload: { conversationId: string; messageId: string }) => void;
  'add:reaction': (payload: { messageId: string; emoji: string }) => void;
  'presence:update': (payload: { status: PresenceStatus }) => void;
}

// ── server → client ──────────────────────────────────────────────────────────

export interface ServerEvents {
  'new:message': (msg: Message) => void;
  'message:edited': (payload: {
    messageId: string;
    content: string | null;
    encrypted?: boolean;
    encryptedContent?: string | null;
    senderKeyFingerprint?: string | null;
    editedAt: string;
  }) => void;
  'message:deleted': (payload: { messageId: string; deletedAt: string }) => void;
  'read:receipt': (payload: { conversationId: string; messageId: string; userId: string }) => void;
  'new:reaction': (payload: {
    messageId: string;
    userId: string;
    emoji: string;
    created: boolean;
  }) => void;
  'typing:start': (payload: { conversationId: string; userId: string; displayName: string }) => void;
  'typing:stop': (payload: { conversationId: string; userId: string }) => void;
  'user:status': (payload: {
    userId: string;
    status: PresenceStatus;
    updatedAt?: string;
  }) => void;
  'joined:conversation': (payload: { conversationId: string }) => void;
  error: (payload: { event: string; message: string }) => void;
}

/** Ensure the `/spark` namespace is connecting and return its socket. */
export function sparkSocket() {
  return connect(NS.spark);
}

export function emitSpark<E extends keyof ClientEvents>(
  event: E,
  ...args: Parameters<ClientEvents[E]>
): void {
  sparkSocket().emit(event, ...args);
}

/** Subscribe to a `/spark` server event; returns an unsubscribe fn. */
export function onSpark<E extends keyof ServerEvents>(
  event: E,
  handler: ServerEvents[E],
): () => void {
  const socket = namespace(NS.spark);
  socket.on(event as string, handler as (...args: unknown[]) => void);
  return () => socket.off(event as string, handler as (...args: unknown[]) => void);
}
