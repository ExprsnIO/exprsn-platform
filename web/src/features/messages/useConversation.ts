import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sparkApi, type Message, type MessagesPage } from '@/api/spark';
import { useE2eeStore } from '@/lib/e2eeStore';
import { encryptMessage } from '@/lib/crypto';
import { emitSpark, onSpark, sparkSocket } from '@/lib/sparkRealtime';
import type { PresenceStatus } from '@/lib/sparkRealtime';
import { sendEncryptedMessage, type SendOptions } from './send';

const messagesKey = (id: string) => ['spark', 'messages', id] as const;

/**
 * Owns one conversation's realtime lifecycle: joins the room, loads + live-
 * updates messages, tracks typing/presence/sender-names, and exposes encrypt-
 * and-send helpers. All sends/edits go over the socket (E2EE), never REST.
 */
export function useConversation(conversationId: string, currentUserId: string) {
  const queryClient = useQueryClient();
  const keyFingerprint = useE2eeStore((s) => s.keyFingerprint);
  const myPublicKey = useE2eeStore((s) => s.myPublicKey);
  const ensurePublicKeys = useE2eeStore((s) => s.ensurePublicKeys);

  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({}); // userId → name
  const [presence, setPresence] = useState<Record<string, PresenceStatus>>({});
  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [missingKeyUsers, setMissingKeyUsers] = useState<string[]>([]);

  const conversationQuery = useQuery({
    queryKey: ['spark', 'conversation', conversationId],
    queryFn: () => sparkApi.getConversation(conversationId),
  });

  const messagesQuery = useQuery({
    queryKey: messagesKey(conversationId),
    queryFn: () => sparkApi.listMessages(conversationId, { limit: 50 }),
  });

  const participantIds = useMemo(() => {
    const participants = conversationQuery.data?.conversation.participants ?? [];
    return participants.filter((p) => p.active).map((p) => p.userId);
  }, [conversationQuery.data]);

  // Mutate the message cache in place for realtime events.
  const patchMessages = useCallback(
    (fn: (prev: Message[]) => Message[]) => {
      queryClient.setQueryData<MessagesPage>(messagesKey(conversationId), (prev) =>
        prev ? { ...prev, messages: fn(prev.messages) } : prev,
      );
    },
    [queryClient, conversationId],
  );

  const rememberName = useCallback((userId: string, displayName?: string) => {
    if (!displayName) return;
    setNameById((m) => (m[userId] === displayName ? m : { ...m, [userId]: displayName }));
  }, []);

  // Join the room + resolve recipient public keys for this conversation.
  useEffect(() => {
    sparkSocket();
    emitSpark('join:conversation', conversationId);
    emitSpark('presence:update', { status: 'online' });
    return () => emitSpark('leave:conversation', conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (participantIds.length === 0) return;
    let cancelled = false;
    ensurePublicKeys(participantIds).then((keyed) => {
      if (cancelled) return;
      setMissingKeyUsers(participantIds.filter((id) => id !== currentUserId && !(id in keyed)));
    });
    return () => {
      cancelled = true;
    };
  }, [participantIds, ensurePublicKeys, currentUserId]);

  // Subscribe to server events for this conversation.
  useEffect(() => {
    const offs = [
      onSpark('new:message', (msg) => {
        if (msg.conversationId !== conversationId) return;
        rememberName(msg.senderId, msg.sender?.displayName);
        patchMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        queryClient.invalidateQueries({ queryKey: ['spark', 'conversations'] });
        setTypingUsers((t) => {
          if (!(msg.senderId in t)) return t;
          const next = { ...t };
          delete next[msg.senderId];
          return next;
        });
        if (msg.senderId !== currentUserId) {
          emitSpark('mark:read', { conversationId, messageId: msg.id });
        }
      }),
      onSpark('message:edited', (p) => {
        patchMessages((prev) =>
          prev.map((m) =>
            m.id === p.messageId
              ? {
                  ...m,
                  content: p.content,
                  encrypted: p.encrypted ?? m.encrypted,
                  encryptedContent: p.encryptedContent ?? m.encryptedContent,
                  senderKeyFingerprint: p.senderKeyFingerprint ?? m.senderKeyFingerprint,
                  edited: true,
                  editedAt: p.editedAt,
                }
              : m,
          ),
        );
        // Drop any cached decrypt of the prior ciphertext.
        useE2eeStore.setState((s) => {
          const next = { ...s.messageKeyById };
          delete next[p.messageId];
          return { messageKeyById: next };
        });
      }),
      onSpark('message:deleted', (p) => {
        patchMessages((prev) =>
          prev.map((m) =>
            m.id === p.messageId ? { ...m, deleted: true, deletedAt: p.deletedAt } : m,
          ),
        );
      }),
      onSpark('read:receipt', (p) => {
        if (p.conversationId !== conversationId) return;
        patchMessages((prev) =>
          prev.map((m) =>
            m.id === p.messageId && !m.readBy.includes(p.userId)
              ? { ...m, readBy: [...m.readBy, p.userId] }
              : m,
          ),
        );
      }),
      onSpark('new:reaction', (p) => {
        patchMessages((prev) =>
          prev.map((m) => {
            if (m.id !== p.messageId) return m;
            const reactions = m.reactions ?? [];
            if (reactions.some((r) => r.userId === p.userId && r.emoji === p.emoji)) return m;
            return {
              ...m,
              reactions: [
                ...reactions,
                {
                  id: `${p.messageId}:${p.userId}:${p.emoji}`,
                  messageId: p.messageId,
                  userId: p.userId,
                  emoji: p.emoji,
                  createdAt: new Date().toISOString(),
                },
              ],
            };
          }),
        );
      }),
      onSpark('typing:start', (p) => {
        if (p.conversationId !== conversationId || p.userId === currentUserId) return;
        rememberName(p.userId, p.displayName);
        setTypingUsers((t) => ({ ...t, [p.userId]: p.displayName }));
      }),
      onSpark('typing:stop', (p) => {
        if (p.conversationId !== conversationId) return;
        setTypingUsers((t) => {
          if (!(p.userId in t)) return t;
          const next = { ...t };
          delete next[p.userId];
          return next;
        });
      }),
      onSpark('user:status', (p) => {
        setPresence((m) => ({ ...m, [p.userId]: p.status }));
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [conversationId, currentUserId, patchMessages, queryClient, rememberName]);

  // Mark the newest message read once history loads.
  useEffect(() => {
    const msgs = messagesQuery.data?.messages;
    if (!msgs || msgs.length === 0) return;
    const newest = msgs[msgs.length - 1];
    if (newest.senderId !== currentUserId) {
      emitSpark('mark:read', { conversationId, messageId: newest.id });
    }
  }, [messagesQuery.data, conversationId, currentUserId]);

  // Build encrypted payload for everyone in the conversation (incl. self).
  const encryptForConversation = useCallback(
    async (text: string) => {
      const keyed = await ensurePublicKeys(participantIds);
      const recipients = { ...keyed };
      if (myPublicKey) recipients[currentUserId] = myPublicKey;
      if (Object.keys(recipients).length === 0) {
        throw new Error('No recipients have encryption keys set up.');
      }
      return encryptMessage(text, recipients);
    },
    [ensurePublicKeys, participantIds, myPublicKey, currentUserId],
  );

  const send = useCallback(
    (text: string, opts?: SendOptions) => sendEncryptedMessage(conversationId, text, opts),
    [conversationId],
  );

  const edit = useCallback(
    async (messageId: string, text: string) => {
      if (!keyFingerprint) throw new Error('Encryption is locked.');
      const { encryptedContent, recipientKeys } = await encryptForConversation(text);
      emitSpark('edit:message', {
        messageId,
        encryptedContent,
        senderKeyFingerprint: keyFingerprint,
        recipientKeys,
      });
    },
    [encryptForConversation, keyFingerprint],
  );

  const remove = useCallback((messageId: string) => {
    emitSpark('delete:message', { messageId });
  }, []);

  const react = useCallback((messageId: string, emoji: string) => {
    emitSpark('add:reaction', { messageId, emoji });
  }, []);

  // Typing emit with debounced stop.
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyTyping = useCallback(() => {
    emitSpark('typing:start', conversationId);
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      emitSpark('typing:stop', conversationId);
    }, 3000);
  }, [conversationId]);

  return {
    conversationQuery,
    messagesQuery,
    participantIds,
    typingUsers,
    presence,
    nameById,
    missingKeyUsers,
    send,
    edit,
    remove,
    react,
    notifyTyping,
  };
}
