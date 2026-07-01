import { useAppStore } from '@/app/store';
import { useE2eeStore } from '@/lib/e2eeStore';
import { encryptMessage } from '@/lib/crypto';
import { emitSpark, sparkSocket } from '@/lib/sparkRealtime';
import { sparkApi, type ChatAttachment } from '@/api/spark';

export interface SendOptions {
  attachments?: ChatAttachment[];
  parentMessageId?: string | null;
  contentType?: string;
}

/** Active participant ids of a conversation (from the detail endpoint). */
async function participantIdsFor(conversationId: string): Promise<string[]> {
  const { conversation } = await sparkApi.getConversation(conversationId);
  return (conversation.participants ?? []).filter((p) => p.active).map((p) => p.userId);
}

/**
 * Encrypt `text` for every active participant of `conversationId` (including the
 * sender, so they can read their own message) and emit it over the `/spark`
 * socket. This is intentionally conversation-agnostic: the active composer,
 * forwarding, share-to-chat, and call cards all route through it, so there is a
 * single E2EE send path rather than four divergent ones.
 *
 * `text` may be empty (e.g. an attachment-only or call-card message) — we still
 * send a valid ciphertext so the backend's encrypted-message invariant holds.
 */
export async function sendEncryptedMessage(
  conversationId: string,
  text: string,
  opts: SendOptions = {},
): Promise<void> {
  const { keyFingerprint, myPublicKey, ensurePublicKeys } = useE2eeStore.getState();
  if (!keyFingerprint) throw new Error('Encryption is locked — unlock messaging first.');

  const currentUserId = useAppStore.getState().user?.id;
  const ids = await participantIdsFor(conversationId);
  const recipients: Record<string, string> = { ...(await ensurePublicKeys(ids)) };
  if (currentUserId && myPublicKey) recipients[currentUserId] = myPublicKey;

  if (Object.keys(recipients).length === 0) {
    throw new Error('No recipients have encryption keys set up.');
  }

  const { encryptedContent, recipientKeys } = await encryptMessage(text, recipients);
  sparkSocket();
  emitSpark('send:message', {
    conversationId,
    encrypted: true,
    encryptedContent,
    senderKeyFingerprint: keyFingerprint,
    recipientKeys,
    ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
    ...(opts.parentMessageId ? { parentMessageId: opts.parentMessageId } : {}),
    ...(opts.contentType ? { contentType: opts.contentType } : {}),
  });
}
