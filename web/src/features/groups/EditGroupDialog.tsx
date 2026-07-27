import { useEffect, useState } from 'react';
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
  type Group,
  type GroupVisibility,
  type JoinMode,
  type UpdateGroupInput,
} from '@/api/nexus';
import { toMessage } from '@/lib/errors';
import { ImageUploadField } from '@/components/ImageUploadField';

const VISIBILITIES: GroupVisibility[] = ['public', 'private', 'unlisted'];
const JOIN_MODES: JoinMode[] = ['open', 'request', 'invite'];

/** Edit-group modal. Mirrors CreateGroupDialog's fields; calls updateGroup. */
export function EditGroupDialog({
  group,
  open,
  onClose,
  onSaved,
}: {
  group: Group;
  open: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<UpdateGroupInput>({});

  // Re-seed the form whenever the dialog opens (or the group changes).
  useEffect(() => {
    if (open) {
      setForm({
        name: group.name ?? '',
        description: (group.description as string) ?? '',
        visibility: (group.visibility as GroupVisibility) ?? 'public',
        joinMode: (group.joinMode as JoinMode) ?? 'open',
        location: (group.location as string) ?? '',
        website: (group.website as string) ?? '',
        avatarUrl: (group.avatarUrl as string) ?? '',
        bannerUrl: (group.bannerUrl as string) ?? '',
      });
    }
  }, [open, group]);

  const set = <K extends keyof UpdateGroupInput>(k: K, v: UpdateGroupInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () =>
      nexusApi.updateGroup(group.id, {
        name: form.name?.trim(),
        description: form.description?.toString().trim() || undefined,
        visibility: form.visibility,
        joinMode: form.joinMode,
        location: form.location?.toString().trim() || undefined,
        website: form.website?.toString().trim() || undefined,
        // TASK-053: null clears the image (Joi allows null; '' would render as
        // a bogus src="" at the consumers, which use `?? undefined`).
        avatarUrl: form.avatarUrl || null,
        bannerUrl: form.bannerUrl || null,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['nexus', 'group', group.id] });
      qc.invalidateQueries({ queryKey: ['nexus', 'memberships'] });
      onSaved(`Saved “${res.group?.name ?? form.name}”`);
      onClose();
    },
  });

  const canSubmit = (form.name ?? '').trim().length >= 2 && !mutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit group</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {mutation.isError && <Alert severity="error">{toMessage(mutation.error)}</Alert>}
          <TextField
            label="Name"
            required
            fullWidth
            value={form.name ?? ''}
            onChange={(e) => set('name', e.target.value)}
            helperText="At least 2 characters"
          />
          <TextField
            label="Description"
            fullWidth
            multiline
            minRows={2}
            value={form.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              select
              label="Visibility"
              fullWidth
              value={form.visibility ?? 'public'}
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
              value={form.joinMode ?? 'open'}
              onChange={(e) => set('joinMode', e.target.value as JoinMode)}
            >
              {JOIN_MODES.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Location"
            fullWidth
            value={form.location ?? ''}
            onChange={(e) => set('location', e.target.value)}
            helperText="Optional — a place name shown on the group"
          />
          <TextField
            label="Website"
            fullWidth
            value={form.website ?? ''}
            onChange={(e) => set('website', e.target.value)}
            helperText="Optional — must be a full URL (https://…)"
          />
          {/* TASK-053: uploaded, FileVault-hosted images instead of free-text
              external URLs; existing external values surface a notice. */}
          <ImageUploadField
            label="Group avatar"
            variant="avatar"
            value={(form.avatarUrl as string) ?? ''}
            onChange={(url) => set('avatarUrl', url)}
          />
          <ImageUploadField
            label="Cover image"
            variant="cover"
            value={(form.bannerUrl as string) ?? ''}
            onChange={(url) => set('bannerUrl', url)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button variant="contained" disabled={!canSubmit} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
