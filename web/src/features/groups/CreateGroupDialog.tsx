import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import {
  nexusApi,
  type CreateGroupInput,
  type GroupVisibility,
  type JoinMode,
} from '@/api/nexus';
import { toMessage } from '@/lib/errors';

const VISIBILITIES: GroupVisibility[] = ['public', 'private', 'unlisted'];
const JOIN_MODES: JoinMode[] = ['open', 'request', 'invite'];

/** Create-group modal. Invalidates groups + memberships on success. */
export function CreateGroupDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateGroupInput>({
    name: '',
    description: '',
    visibility: 'public',
    joinMode: 'open',
  });

  const set = <K extends keyof CreateGroupInput>(k: K, v: CreateGroupInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () =>
      nexusApi.createGroup({
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
        visibility: form.visibility,
        joinMode: form.joinMode,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['nexus'] });
      onCreated(`Created “${res.group?.name ?? form.name}”`);
      setForm({ name: '', description: '', visibility: 'public', joinMode: 'open' });
      onClose();
    },
  });

  const canSubmit = form.name.trim().length >= 2 && !mutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New group</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {mutation.isError && <Alert severity="error">{toMessage(mutation.error)}</Alert>}
          <TextField
            label="Name"
            required
            fullWidth
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            helperText="At least 2 characters"
          />
          <TextField
            label="Description"
            fullWidth
            multiline
            minRows={2}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              select
              label="Visibility"
              fullWidth
              value={form.visibility}
              onChange={(e) => set('visibility', e.target.value as GroupVisibility)}
            >
              {VISIBILITIES.map((v) => (
                <MenuItem key={v} value={v}>
                  {v}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Join mode"
              fullWidth
              value={form.joinMode}
              onChange={(e) => set('joinMode', e.target.value as JoinMode)}
              helperText={
                form.joinMode === 'open'
                  ? 'Anyone can join instantly'
                  : form.joinMode === 'request'
                    ? 'Requires approval'
                    : 'Invite only'
              }
            >
              {JOIN_MODES.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button variant="contained" disabled={!canSubmit} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
