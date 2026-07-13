/**
 * Accept-invite / activation landing — /accept-invite?token=…, a top-level
 * anonymous route (no app shell, no auth guard), same pattern as the FileVault
 * share landing and the public low-code form. A single-step set-password form;
 * invite and activation links share this page (the token's kind doesn't change
 * the UI). On success it establishes the session and drops the user into the
 * app — the same terminal move as LoginPage.finish().
 */
import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Stack, TextField, Typography,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import { toMessage } from '@/lib/errors';
import { useAppStore } from '@/app/store';

export function AcceptInvitePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const setSession = useAppStore((s) => s.setSession);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const accept = useMutation({
    mutationFn: () =>
      authApi.acceptInvite({ token, password, displayName: displayName || undefined }),
    onSuccess: (res) => {
      setSession(res.user, res.token);
      navigate('/', { replace: true });
    },
    onError: (err) => setError(toMessage(err)),
  });

  const mismatch = password.length > 0 && confirm.length > 0 && password !== confirm;
  const busy = accept.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    accept.mutate();
  };

  if (!token) {
    return (
      <Center>
        <Card sx={{ width: '100%', maxWidth: 480 }}>
          <CardContent>
            <Alert severity="error">Invalid invitation link — no token was provided.</Alert>
          </CardContent>
        </Card>
      </Center>
    );
  }

  return (
    <Center>
      <Card sx={{ width: '100%', maxWidth: 480 }}>
        <CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="overline" color="text.secondary">Exprsn</Typography>
              <Typography variant="h5">Set your password</Typography>
              <Typography variant="body2" color="text.secondary">
                Choose a password to activate your account and continue.
              </Typography>
            </Box>

            <form onSubmit={submit}>
              <Stack spacing={2}>
                <TextField
                  label="Display name (optional)"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                  fullWidth
                />
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  autoFocus
                  fullWidth
                  helperText="At least 8 characters with upper- and lower-case, a number, and a special character."
                />
                <TextField
                  label="Confirm password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  fullWidth
                  error={mismatch}
                  helperText={mismatch ? 'Passwords do not match' : undefined}
                />

                {error && <Alert severity="error">{error}</Alert>}

                <Button
                  type="submit"
                  variant="contained"
                  disabled={busy || !password || password !== confirm}
                  fullWidth
                >
                  {busy ? 'Setting password…' : 'Set password & continue'}
                </Button>
              </Stack>
            </form>
          </Stack>
        </CardContent>
      </Card>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: 'background.default' }}>
      {children}
    </Box>
  );
}
