import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { accountApi, type AccountUser, type ProfileUpdate } from '@/api/account';
import { useAppStore } from '@/app/store';
import { toMessage } from '@/lib/errors';
import { ImageUploadField } from '@/components/ImageUploadField';

/**
 * Edit the editable profile fields (PUT /auth/api/users/:id — CA-bearer guarded).
 * On success we update the in-memory identity (`setUser`) so the AppBar reflects
 * the new name immediately, and invalidate the `me` query.
 */
export function ProfileForm({ user }: { user: AccountUser }) {
  const queryClient = useQueryClient();
  const setUser = useAppStore((s) => s.setUser);

  const [form, setForm] = useState<ProfileUpdate>({
    displayName: user.displayName ?? '',
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    bio: user.bio ?? '',
    avatarUrl: user.avatarUrl ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Single owner of the "editing clears the saved banner" rule.
  const setField = (key: keyof ProfileUpdate, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDone(false);
  };
  const set = (key: keyof ProfileUpdate) => (e: { target: { value: string } }) =>
    setField(key, e.target.value);

  const mutation = useMutation({
    mutationFn: () => accountApi.updateProfile(user.id, form),
    onSuccess: (res) => {
      setUser(res.user);
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setError(null);
      setDone(true);
    },
    onError: (err) => {
      setDone(false);
      setError(toMessage(err));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 560 }}>
      <form onSubmit={submit}>
        <Stack spacing={2}>
          <Typography variant="h6">Profile</Typography>
          <Typography variant="body2" color="text.secondary">
            Signed in as {user.email}
          </Typography>

          {error && <Alert severity="error">{error}</Alert>}
          {done && <Alert severity="success">Profile saved.</Alert>}

          <TextField label="Display name" value={form.displayName} onChange={set('displayName')} fullWidth />
          <Stack direction="row" spacing={2}>
            <TextField label="First name" value={form.firstName} onChange={set('firstName')} fullWidth />
            <TextField label="Last name" value={form.lastName} onChange={set('lastName')} fullWidth />
          </Stack>
          <TextField label="Bio" value={form.bio} onChange={set('bio')} multiline minRows={2} fullWidth />
          {/* TASK-053: uploaded, FileVault-hosted avatar instead of a free-text
              external URL (the CSP only renders same-origin images). */}
          <ImageUploadField
            label="Avatar"
            variant="avatar"
            value={form.avatarUrl ?? ''}
            onChange={(url) => setField('avatarUrl', url)}
          />

          <Button type="submit" variant="contained" disabled={mutation.isPending} sx={{ alignSelf: 'flex-start' }}>
            {mutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
