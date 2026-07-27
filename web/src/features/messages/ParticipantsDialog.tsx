import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { sparkApi, type Conversation } from '@/api/spark';
import { usersApi, type PublicUser } from '@/api/users';
import { toMessage } from '@/lib/errors';
import { initials } from './util';
import { PeoplePicker } from './PeoplePicker';

/**
 * Manage a conversation's people: see members + roles, rename a group, add new
 * participants, and leave. Remove-others is intentionally absent — the backend
 * exposes add + self-leave only (no remove-participant route).
 */
export function ParticipantsDialog({
  open,
  onClose,
  conversation,
  currentUserId,
  onLeft,
}: {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
  currentUserId: string;
  onLeft: () => void;
}) {
  const qc = useQueryClient();
  const isGroup = conversation.type === 'group';
  const participants = useMemo(
    () => (conversation.participants ?? []).filter((p) => p.active),
    [conversation.participants],
  );
  const myRole = participants.find((p) => p.userId === currentUserId)?.role;
  const canManage = isGroup && (myRole === 'owner' || myRole === 'admin');

  const ids = participants.map((p) => p.userId);
  const namesQ = useQuery({
    queryKey: ['people', 'profiles', ids.sort().join(',')],
    queryFn: () => usersApi.profilesByIds(ids),
    enabled: open && ids.length > 0,
  });
  const nameById = useMemo(() => {
    const m: Record<string, string> = {};
    (namesQ.data?.users ?? []).forEach((u) => {
      if (u.displayName) m[u.id] = u.displayName;
    });
    return m;
  }, [namesQ.data]);

  const [name, setName] = useState(conversation.name ?? '');
  const [toAdd, setToAdd] = useState<PublicUser[]>([]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['spark', 'conversation', conversation.id] });
    qc.invalidateQueries({ queryKey: ['spark', 'conversations'] });
  };

  const renameMutation = useMutation({
    mutationFn: () => sparkApi.updateConversation(conversation.id, { name: name.trim() || null }),
    onSuccess: invalidate,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      for (const u of toAdd) await sparkApi.addParticipant(conversation.id, u.id);
    },
    onSuccess: () => {
      setToAdd([]);
      invalidate();
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => sparkApi.leaveConversation(conversation.id),
    onSuccess: () => {
      invalidate();
      onLeft();
    },
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Conversation details</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {canManage && (
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                fullWidth
                size="small"
                label="Group name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                variant="outlined"
                disabled={renameMutation.isPending || (name.trim() === (conversation.name ?? ''))}
                onClick={() => renameMutation.mutate()}
              >
                Save
              </Button>
            </Stack>
          )}

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              {participants.length} participant{participants.length === 1 ? '' : 's'}
            </Typography>
            <List dense disablePadding>
              {participants.map((p) => {
                const label = p.userId === currentUserId ? 'You' : nameById[p.userId] || p.userId.slice(0, 8);
                return (
                  <ListItem key={p.id} disableGutters>
                    <ListItemAvatar>
                      <Avatar sx={{ width: 32, height: 32, fontSize: 13 }}>{initials(label)}</Avatar>
                    </ListItemAvatar>
                    <ListItemText primary={label} />
                    {p.role !== 'member' && <Chip size="small" label={p.role} />}
                  </ListItem>
                );
              })}
            </List>
          </Box>

          {canManage && (
            <>
              <Divider />
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <Box sx={{ flex: 1 }}>
                  <PeoplePicker
                    selected={toAdd}
                    onChange={setToAdd}
                    excludeIds={ids}
                    label="Add participants"
                  />
                </Box>
                <Tooltip title="Add">
                  <span>
                    <IconButton
                      color="primary"
                      aria-label="Add"
                      disabled={toAdd.length === 0 || addMutation.isPending}
                      onClick={() => addMutation.mutate()}
                    >
                      <PersonAddIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            </>
          )}

          {(renameMutation.isError || addMutation.isError || leaveMutation.isError) && (
            <Alert severity="error">
              {toMessage(renameMutation.error || addMutation.error || leaveMutation.error)}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Button
          color="error"
          startIcon={<LogoutIcon />}
          disabled={leaveMutation.isPending}
          onClick={() => leaveMutation.mutate()}
        >
          Leave
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
