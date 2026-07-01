/**
 * useStreamRealtime — live viewer presence + ephemeral chat for a stream, over
 * the shared `/live` Socket.IO namespace.
 *
 * Viewing is open to everyone: the hook joins the stream's socket room (driving
 * the server's `viewer-count-updated` broadcast) and replays recent chat via
 * `chat-history`. Posting a chat message requires a signed-in user — the server
 * gates `stream-chat-message` on a validated CA bearer (sent in the handshake)
 * and binds the author to that identity, so `canChat` here is only a UX hint.
 *
 * The `/live` namespace is shared (video rooms use it too), so on teardown we
 * emit `leave-stream` and detach our own listeners but leave the multiplexed
 * connection up for reuse rather than tearing the namespace down.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { NS, connect } from '@/lib/realtime';
import { useAppStore } from '@/app/store';
import type { StreamChatMessage } from '@/api/live';

const CHAT_BUFFER_LIMIT = 200;

export interface UseStreamRealtimeResult {
  viewerCount: number | null;
  messages: StreamChatMessage[];
  canChat: boolean;
  chatError: string | null;
  sendMessage: (text: string) => void;
}

function dedupePush(prev: StreamChatMessage[], msg: StreamChatMessage): StreamChatMessage[] {
  if (prev.some((m) => m.id === msg.id)) return prev;
  const next = [...prev, msg];
  return next.length > CHAT_BUFFER_LIMIT ? next.slice(next.length - CHAT_BUFFER_LIMIT) : next;
}

export function useStreamRealtime(streamId: string | null): UseStreamRealtimeResult {
  const user = useAppStore((s) => s.user);
  const authed = useAppStore((s) => s.status === 'authenticated');
  const displayName = user?.displayName || user?.firstName || user?.email;

  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const [messages, setMessages] = useState<StreamChatMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const displayNameRef = useRef<string | undefined>(displayName);
  displayNameRef.current = displayName;

  useEffect(() => {
    if (!streamId) return;

    setViewerCount(null);
    setMessages([]);
    setChatError(null);

    const socket = connect(NS.live);
    socketRef.current = socket;

    const join = () => socket.emit('join-stream', { streamId });

    const onViewerCount = (p: { streamId: string; count: number }) => {
      if (p.streamId === streamId) setViewerCount(p.count);
    };
    const onHistory = (p: { streamId: string; messages: StreamChatMessage[] }) => {
      if (p.streamId === streamId) {
        setMessages(p.messages.slice(-CHAT_BUFFER_LIMIT));
      }
    };
    const onMessage = (m: StreamChatMessage) => {
      if (m.streamId === streamId) setMessages((prev) => dedupePush(prev, m));
    };
    const onError = (e: { event?: string; message?: string }) => {
      if (e?.event === 'stream-chat-message') setChatError(e.message || 'Message failed');
    };

    socket.on('connect', join);
    socket.on('viewer-count-updated', onViewerCount);
    socket.on('chat-history', onHistory);
    socket.on('stream-chat-message', onMessage);
    socket.on('error', onError);

    // Already connected (namespace reused from a prior view) → join immediately.
    if (socket.connected) join();

    return () => {
      socket.emit('leave-stream', { streamId });
      socket.off('connect', join);
      socket.off('viewer-count-updated', onViewerCount);
      socket.off('chat-history', onHistory);
      socket.off('stream-chat-message', onMessage);
      socket.off('error', onError);
      socketRef.current = null;
    };
  }, [streamId]);

  const sendMessage = useCallback(
    (text: string) => {
      const socket = socketRef.current;
      const trimmed = text.trim();
      if (!socket || !streamId || !trimmed) return;
      setChatError(null);
      socket.emit('stream-chat-message', {
        streamId,
        message: trimmed,
        displayName: displayNameRef.current,
      });
    },
    [streamId],
  );

  return {
    viewerCount,
    messages,
    canChat: authed,
    chatError,
    sendMessage,
  };
}
