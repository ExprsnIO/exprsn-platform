import { useEffect, useRef } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { toMessage } from '@/lib/errors';
import { useConversation } from './useConversation';
import { MessageItem } from './MessageItem';
import { Composer } from './Composer';
import { conversationTitle, sortByCreated } from './util';

export function ConversationView({
  conversationId,
  currentUserId,
}: {
  conversationId: string;
  currentUserId: string;
}) {
  const {
    conversationQuery,
    messagesQuery,
    typingUsers,
    nameById,
    missingKeyUsers,
    send,
    edit,
    remove,
    react,
    notifyTyping,
  } = useConversation(conversationId, currentUserId);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = messagesQuery.data ? sortByCreated(messagesQuery.data.messages) : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const typingLabel = Object.values(typingUsers);

  return (
    <Stack sx={{ height: '100%' }}>
      <Box sx={{ p: 1.5 }}>
        <Typography variant="subtitle1">
          {conversationQuery.data
            ? conversationTitle(conversationQuery.data.conversation)
            : 'Conversation'}
        </Typography>
        {missingKeyUsers.length > 0 && (
          <Chip
            size="small"
            color="warning"
            icon={<LockIcon />}
            label={`${missingKeyUsers.length} participant(s) can't read encrypted messages`}
            sx={{ mt: 0.5 }}
          />
        )}
      </Box>
      <Divider />

      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
        {messagesQuery.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : messagesQuery.error ? (
          <Alert severity="error">{toMessage(messagesQuery.error)}</Alert>
        ) : (
          <Stack spacing={1.5}>
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                currentUserId={currentUserId}
                nameById={nameById}
                onEdit={edit}
                onDelete={remove}
                onReact={react}
              />
            ))}
            <div ref={bottomRef} />
          </Stack>
        )}
      </Box>

      {typingLabel.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, py: 0.5 }}>
          {typingLabel.join(', ')} {typingLabel.length === 1 ? 'is' : 'are'} typing…
        </Typography>
      )}

      <Composer onSend={send} onTyping={notifyTyping} />
    </Stack>
  );
}
