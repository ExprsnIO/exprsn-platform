import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sparkApi, type GroupChannelKind, type Message, type MessagesPage } from '@/api/spark';
import { emitSpark, onSpark, sparkSocket } from '@/lib/sparkRealtime';

const messagesKey = (id: string | undefined) => ['spark', 'group-messages', id] as const;

/**
 * Realtime lifecycle for ONE plaintext group channel. Joins the channel's
 * room over the existing `/spark` socket, loads history (listMessages), live-
 * patches the cache from socket events, and exposes a REST send helper. Group
 * channels are NOT E2E-encrypted, so no encryption fields are ever sent.
 */
export function useGroupChannel(
  groupId: string,
  channelKind: GroupChannelKind,
  conversationId: string | undefined,
  currentUserId: string,
) {
  const queryClient = useQueryClient();
  const [nameById, setNameById] = useState<Record<string, string>>({});

  const messagesQuery = useQuery({
    queryKey: messagesKey(conversationId),
    queryFn: () => sparkApi.listMessages(conversationId as string, { limit: 50 }),
    enabled: !!conversationId,
  });

  const patchMessages = useCallback(
    (fn: (prev: Message[]) => Message[]) => {
      queryClient.setQueryData<MessagesPage>(messagesKey(conversationId), (prev) =>
        prev ? { ...prev, messages: fn(prev.messages) } : prev,
      );
    },
    [queryClient, conversationId],
  );

  const upsert = useCallback(
    (msg: Message) =>
      patchMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])),
    [patchMessages],
  );

  // Join this channel's room; leave on switch/unmount.
  useEffect(() => {
    if (!conversationId) return;
    sparkSocket();
    emitSpark('join:conversation', conversationId);
    return () => emitSpark('leave:conversation', conversationId);
  }, [conversationId]);

  // Subscribe to channel events for the active conversation.
  useEffect(() => {
    if (!conversationId) return;
    const offs = [
      onSpark('new:message', (msg) => {
        if (msg.conversationId !== conversationId) return;
        if (msg.sender?.displayName) {
          setNameById((m) =>
            m[msg.senderId] === msg.sender!.displayName
              ? m
              : { ...m, [msg.senderId]: msg.sender!.displayName as string },
          );
        }
        upsert(msg);
      }),
      onSpark('message:edited', (p) => {
        patchMessages((prev) =>
          prev.map((m) =>
            m.id === p.messageId
              ? { ...m, content: p.content, edited: true, editedAt: p.editedAt }
              : m,
          ),
        );
      }),
      onSpark('message:deleted', (p) => {
        patchMessages((prev) =>
          prev.map((m) =>
            m.id === p.messageId ? { ...m, deleted: true, deletedAt: p.deletedAt } : m,
          ),
        );
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [conversationId, patchMessages, upsert]);

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      sparkApi.sendGroupChannelMessage(groupId, channelKind, { content }),
    // The server also broadcasts new:message; upsert dedups by id either way.
    onSuccess: (res) => upsert(res.message),
  });

  const send = useCallback(
    async (text: string) => {
      await sendMutation.mutateAsync(text);
    },
    [sendMutation],
  );

  return { messagesQuery, nameById, send, currentUserId };
}
