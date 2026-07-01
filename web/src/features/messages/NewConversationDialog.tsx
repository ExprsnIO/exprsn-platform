import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { sparkApi } from '@/api/spark';
import { type PublicUser } from '@/api/users';
import { toMessage } from '@/lib/errors';
import { PeoplePicker } from './PeoplePicker';

/**
 * Start a new conversation. One recipient → a 1:1 direct (E2EE) message; two or
 * more → a group conversation (optional name). On success the new conversation
 * is selected and the list refetched.
 */
export function NewConversationDialog({
  open,
  onClose,
  onCreated,
  excludeIds = [],
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
  /** Usually the current user's id (can't DM yourself). */
  excludeIds?: string[];
}) {
  const qc = useQueryClient();
  const [people, setPeople] = useState<PublicUser[]>([]);
  const [name, setName] = useState('');

  const isGroup = people.length > 1;

  const reset = () => {
    setPeople([]);
    setName('');
  };

  const mutation = useMutation({
    mutationFn: () =>
      sparkApi.createConversation({
        type: isGroup ? 'group' : 'direct',
        participantIds: people.map((p) => p.id),
        ...(isGroup && name.trim() ? { name: name.trim() } : {}),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['spark', 'conversations'] });
      reset();
      onCreated(res.conversation.id);
    },
  });

  const close = () => {
    reset();
    mutation.reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>New message</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {mutation.isError && <Alert severity="error">{toMessage(mutation.error)}</Alert>}
          <PeoplePicker selected={people} onChange={setPeople} excludeIds={excludeIds} />
          {isGroup && (
            <TextField
              fullWidth
              label="Group name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <Typography variant="caption" color="text.secondary">
            {people.length <= 1 ? (
              <>
                <Chip size="small" label="Direct" sx={{ mr: 0.5 }} /> end-to-end encrypted 1:1 chat.
              </>
            ) : (
              <>
                <Chip size="small" color="secondary" label="Group" sx={{ mr: 0.5 }} /> {people.length} people.
              </>
            )}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={people.length === 0 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Starting…' : 'Start chat'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
