import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { sparkApi, type ChatAttachment } from '@/api/spark';
import { useE2eeStore } from '@/lib/e2eeStore';
import { toMessage } from '@/lib/errors';
import { conversationTitle, initials } from './util';
import { sendEncryptedMessage } from './send';

export interface SharePayload {
  text?: string;
  attachments?: ChatAttachment[];
}

/**
 * Pick a conversation and send a payload into it (encrypted). Reused by message
 * forwarding and by "Share to chat" from the timeline / files. Requires E2EE to
 * be unlocked this session (the share encrypts for the target's participants).
 */
export function ShareToChatDialog({
  open,
  onClose,
  payload,
  title = 'Share to chat',
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  payload: SharePayload;
  title?: string;
  onSent?: (conversationId: string) => void;
}) {
  const unlocked = useE2eeStore((s) => s.status) === 'unlocked';
  const [selected, setSelected] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['spark', 'conversations'],
    queryFn: sparkApi.listConversations,
    enabled: open,
  });

  const sendMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Pick a conversation.');
      return sendEncryptedMessage(selected, payload.text ?? '', { attachments: payload.attachments });
    },
    onSuccess: () => {
      const id = selected!;
      setSelected(null);
      onSent?.(id);
      onClose();
    },
  });

  const conversations = listQ.data?.conversations ?? [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {!unlocked ? (
          <Alert severity="info">
            Open <strong>Messages</strong> and unlock encryption once, then you can share here.
          </Alert>
        ) : conversations.length === 0 ? (
          <Typography color="text.secondary">No conversations yet — start one in Messages first.</Typography>
        ) : (
          <List disablePadding>
            {conversations.map((c) => {
              const t = conversationTitle(c);
              return (
                <ListItemButton
                  key={c.id}
                  selected={selected === c.id}
                  onClick={() => setSelected(c.id)}
                >
                  <ListItemAvatar>
                    <Avatar sx={{ width: 32, height: 32, fontSize: 13 }}>{initials(t)}</Avatar>
                  </ListItemAvatar>
                  <ListItemText primary={t} secondary={c.type} />
                </ListItemButton>
              );
            })}
          </List>
        )}
        {sendMutation.isError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {toMessage(sendMutation.error)}
          </Alert>
        )}
        {payload.text && (
          <Stack sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Sends: “{payload.text.slice(0, 80)}{payload.text.length > 80 ? '…' : ''}”
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!unlocked || !selected || sendMutation.isPending}
          onClick={() => sendMutation.mutate()}
        >
          {sendMutation.isPending ? 'Sending…' : 'Send'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
