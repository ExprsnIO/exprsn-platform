import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import GroupIcon from '@mui/icons-material/Group';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import { toMessage } from '@/lib/errors';
import { sparkApi, type ChatAttachment, type Message } from '@/api/spark';
import { roomApi } from '@/api/live';
import { useConversation } from './useConversation';
import { MessageItem } from './MessageItem';
import { Composer } from './Composer';
import { PinnedBar } from './PinnedBar';
import { ParticipantsDialog } from './ParticipantsDialog';
import { ShareToChatDialog, type SharePayload } from './ShareToChatDialog';
import { conversationTitle, shortId, sortByCreated } from './util';
import type { PresenceStatus } from '@/lib/sparkRealtime';

const PRESENCE_COLOR: Record<PresenceStatus, string> = {
  online: 'success.main',
  away: 'warning.main',
  busy: 'error.main',
  offline: 'text.disabled',
};

export function ConversationView({
  conversationId,
  currentUserId,
  onLeft,
}: {
  conversationId: string;
  currentUserId: string;
  onLeft: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const {
    conversationQuery,
    messagesQuery,
    typingUsers,
    presence,
    nameById,
    missingKeyUsers,
    send,
    edit,
    remove,
    react,
    notifyTyping,
  } = useConversation(conversationId, currentUserId);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(
    () => (messagesQuery.data ? sortByCreated(messagesQuery.data.messages) : []),
    [messagesQuery.data],
  );

  const [replyingTo, setReplyingTo] = useState<{ id: string; label: string } | null>(null);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [forwarding, setForwarding] = useState<SharePayload | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const conversation = conversationQuery.data?.conversation;
  const participants = useMemo(
    () => (conversation?.participants ?? []).filter((p) => p.active),
    [conversation],
  );
  const myRole = participants.find((p) => p.userId === currentUserId)?.role;
  const canPin = myRole === 'owner' || myRole === 'admin';

  // Presence of the other participant(s) — for the header indicator.
  const others = participants.filter((p) => p.userId !== currentUserId);
  const headerPresence = others
    .map((p) => presence[p.userId])
    .find((s) => s === 'online') ?? others.map((p) => presence[p.userId]).find(Boolean);

  // Resolve a sender label for a message id (for reply quote chips).
  const labelFor = (userId: string) =>
    userId === currentUserId ? 'You' : nameById[userId] || shortId(userId);
  const messageById = useMemo(() => {
    const m: Record<string, Message> = {};
    messages.forEach((msg) => (m[msg.id] = msg));
    return m;
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Reset transient UI when switching conversations.
  useEffect(() => {
    setReplyingTo(null);
    setParticipantsOpen(false);
    setForwarding(null);
  }, [conversationId]);

  const handleSend = async (text: string, attachments?: ChatAttachment[]) => {
    await send(text, { attachments, parentMessageId: replyingTo?.id ?? null });
    setReplyingTo(null);
  };

  const pinMutation = useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: boolean }) =>
      pin ? sparkApi.pinMessage(id) : sparkApi.unpinMessage(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spark', 'pinned', conversationId] });
      qc.invalidateQueries({ queryKey: ['spark', 'messages', conversationId] });
    },
  });

  const callMutation = useMutation({
    mutationFn: async () => {
      const title = conversation ? conversationTitle(conversation) : 'Call';
      const { room } = await roomApi.createRoom({ name: `${title} call` });
      await send('📹 Started a video call', {
        attachments: [
          { kind: 'call', roomId: room.id, roomCode: room.room_code, title: 'Video call' },
        ],
      });
      return room;
    },
    onSuccess: (room) => navigate(`/rooms?join=${encodeURIComponent(room.room_code)}`),
    onError: (e) => setCallError(toMessage(e)),
  });

  const typingLabel = Object.values(typingUsers);

  return (
    <Stack sx={{ height: '100%' }}>
      <Box sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          {headerPresence && (
            <Tooltip title={headerPresence}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: PRESENCE_COLOR[headerPresence] }} />
            </Tooltip>
          )}
          <Typography variant="subtitle1" sx={{ flex: 1, minWidth: 0 }} noWrap>
            {conversation ? conversationTitle(conversation) : 'Conversation'}
          </Typography>
          <Tooltip title="Start a video call">
            <span>
              <IconButton size="small" aria-label="Start a video call" onClick={() => callMutation.mutate()} disabled={callMutation.isPending}>
                <VideoCallIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Participants & details">
            <IconButton aria-label="Participants & details" size="small" onClick={() => setParticipantsOpen(true)}>
              <GroupIcon />
            </IconButton>
          </Tooltip>
        </Stack>
        {missingKeyUsers.length > 0 && (
          <Chip
            size="small"
            color="warning"
            icon={<LockIcon />}
            label={`${missingKeyUsers.length} participant(s) can't read encrypted messages`}
            sx={{ mt: 0.5 }}
          />
        )}
        {callError && (
          <Alert severity="error" sx={{ mt: 0.5 }} onClose={() => setCallError(null)}>
            {callError}
          </Alert>
        )}
      </Box>
      <Divider />

      <PinnedBar
        conversationId={conversationId}
        canUnpin={canPin}
        onUnpin={(id) => pinMutation.mutate({ id, pin: false })}
      />

      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
        {messagesQuery.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : messagesQuery.error ? (
          <Alert severity="error">{toMessage(messagesQuery.error)}</Alert>
        ) : (
          <Stack spacing={1.5}>
            {messages.map((m) => {
              const parent = m.parentMessageId ? messageById[m.parentMessageId] : undefined;
              return (
                <MessageItem
                  key={m.id}
                  message={m}
                  currentUserId={currentUserId}
                  nameById={nameById}
                  parentSenderLabel={parent ? labelFor(parent.senderId) : undefined}
                  canPin={canPin}
                  onEdit={edit}
                  onDelete={remove}
                  onReact={react}
                  onReply={(msg) => setReplyingTo({ id: msg.id, label: labelFor(msg.senderId) })}
                  onForward={(msg, decryptedText) =>
                    setForwarding({
                      text: decryptedText ? `↪ Forwarded: ${decryptedText}` : '↪ Forwarded a message',
                      attachments: msg.attachments?.length ? msg.attachments : undefined,
                    })
                  }
                  onPin={(id) => pinMutation.mutate({ id, pin: true })}
                  onUnpin={(id) => pinMutation.mutate({ id, pin: false })}
                />
              );
            })}
            <div ref={bottomRef} />
          </Stack>
        )}
      </Box>

      {typingLabel.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, py: 0.5 }}>
          {typingLabel.join(', ')} {typingLabel.length === 1 ? 'is' : 'are'} typing…
        </Typography>
      )}

      <Composer
        onSend={handleSend}
        onTyping={notifyTyping}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />

      {conversation && (
        <ParticipantsDialog
          open={participantsOpen}
          onClose={() => setParticipantsOpen(false)}
          conversation={conversation}
          currentUserId={currentUserId}
          onLeft={() => {
            setParticipantsOpen(false);
            onLeft();
          }}
        />
      )}

      <ShareToChatDialog
        open={!!forwarding}
        onClose={() => setForwarding(null)}
        payload={forwarding ?? {}}
        title="Forward message"
        onSent={(id) => navigate(`/messages?c=${id}`)}
      />
    </Stack>
  );
}
