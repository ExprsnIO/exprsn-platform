import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { accountApi, type MfaSetup } from '@/api/account';
import { useAppStore } from '@/app/store';
import { toMessage } from '@/lib/errors';

/** Security tab: password change + MFA management. */
export function SecuritySection() {
  return (
    <Stack spacing={3} sx={{ maxWidth: 560 }}>
      <PasswordCard />
      <MfaCard />
    </Stack>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () => accountApi.changePassword(current, next, confirm),
    onSuccess: () => {
      setError(null);
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    },
    onError: (err) => {
      setDone(false);
      setError(toMessage(err));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    mutation.mutate();
  };

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <form onSubmit={submit}>
        <Stack spacing={2}>
          <Typography variant="h6">Password</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {done && <Alert severity="success">Password changed.</Alert>}
          <TextField
            label="Current password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
            fullWidth
          />
          <TextField
            label="New password"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            required
            fullWidth
            helperText="At least 12 characters with mixed case, a digit and a symbol."
          />
          <TextField
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            fullWidth
          />
          <Button type="submit" variant="contained" disabled={mutation.isPending} sx={{ alignSelf: 'flex-start' }}>
            {mutation.isPending ? 'Updating…' : 'Change password'}
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}

function MfaCard() {
  const queryClient = useQueryClient();
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);

  const { data, isLoading, error } = useQuery({
    queryKey: ['mfa-status'],
    queryFn: accountApi.mfaStatus,
  });

  // Local wizard state: the setup payload (QR + codes) lives only in memory and
  // is shown once — never refetched.
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Dialogs for the password-guarded actions.
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenCodes, setRegenCodes] = useState<string[] | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
    queryClient.invalidateQueries({ queryKey: ['me'] });
  };

  const setupMutation = useMutation({
    mutationFn: accountApi.mfaSetup,
    onSuccess: (res) => {
      setActionError(null);
      setSetup(res);
    },
    onError: (err) => setActionError(toMessage(err)),
  });

  const verifyMutation = useMutation({
    mutationFn: () => accountApi.mfaVerify(code),
    onSuccess: () => {
      setSetup(null);
      setCode('');
      setActionError(null);
      if (user) setUser({ ...user, mfaEnabled: true });
      refresh();
    },
    onError: (err) => setActionError(toMessage(err)),
  });

  if (isLoading) return <Paper variant="outlined" sx={{ p: 3 }}><CircularProgress size={24} /></Paper>;
  if (error) {
    return (
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Alert severity="error">{toMessage(error)}</Alert>
      </Paper>
    );
  }

  const enabled = data!.mfaEnabled;

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="h6">Two-factor authentication</Typography>
          <Chip size="small" color={enabled ? 'success' : 'default'} label={enabled ? 'On' : 'Off'} />
        </Stack>

        {actionError && <Alert severity="error">{actionError}</Alert>}

        {/* --- Disabled: enable wizard --- */}
        {!enabled && !setup && (
          <>
            <Typography variant="body2" color="text.secondary">
              Protect your account with a time-based one-time code from an authenticator app.
            </Typography>
            <Button
              variant="contained"
              onClick={() => setupMutation.mutate()}
              disabled={setupMutation.isPending}
              sx={{ alignSelf: 'flex-start' }}
            >
              {setupMutation.isPending ? 'Starting…' : 'Enable 2FA'}
            </Button>
          </>
        )}

        {!enabled && setup && (
          <Stack spacing={2}>
            <Typography variant="body2">
              Scan this QR code in your authenticator app, then enter the 6-digit code to finish.
            </Typography>
            <Box component="img" src={setup.qrCode} alt="MFA QR code" sx={{ width: 200, height: 200 }} />
            <Typography variant="caption" color="text.secondary">
              Can’t scan? Enter this secret manually: <code>{setup.secret}</code>
            </Typography>

            <BackupCodes codes={setup.backupCodes} />

            <form
              onSubmit={(e) => {
                e.preventDefault();
                verifyMutation.mutate();
              }}
            >
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <TextField
                  label="Verification code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputProps={{ inputMode: 'numeric' }}
                  autoComplete="one-time-code"
                  required
                />
                <Button type="submit" variant="contained" disabled={verifyMutation.isPending} sx={{ mt: 1 }}>
                  {verifyMutation.isPending ? 'Verifying…' : 'Verify & enable'}
                </Button>
                <Button
                  onClick={() => {
                    setSetup(null);
                    setCode('');
                    setActionError(null);
                  }}
                  sx={{ mt: 1 }}
                >
                  Cancel
                </Button>
              </Stack>
            </form>
          </Stack>
        )}

        {/* --- Enabled: manage --- */}
        {enabled && (
          <>
            <Typography variant="body2" color="text.secondary">
              {data!.backupCodesRemaining} backup code{data!.backupCodesRemaining === 1 ? '' : 's'} remaining.
            </Typography>
            {regenCodes && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  New backup codes
                </Typography>
                <BackupCodes codes={regenCodes} />
              </Box>
            )}
            <Stack direction="row" spacing={2}>
              <Button variant="outlined" onClick={() => setRegenOpen(true)}>
                Regenerate backup codes
              </Button>
              <Button variant="outlined" color="error" onClick={() => setDisableOpen(true)}>
                Disable 2FA
              </Button>
            </Stack>
          </>
        )}
      </Stack>

      <PasswordDialog
        open={disableOpen}
        title="Disable two-factor authentication"
        confirmLabel="Disable"
        confirmColor="error"
        onClose={() => setDisableOpen(false)}
        action={(password) => accountApi.mfaDisable(password)}
        onDone={() => {
          if (user) setUser({ ...user, mfaEnabled: false });
          setRegenCodes(null);
          refresh();
        }}
      />

      <PasswordDialog
        open={regenOpen}
        title="Regenerate backup codes"
        confirmLabel="Regenerate"
        onClose={() => setRegenOpen(false)}
        action={(password) => accountApi.mfaRegenerateBackupCodes(password)}
        onDone={(res) => {
          setRegenCodes(res.backupCodes);
          refresh();
        }}
      />
    </Paper>
  );
}

/** One-time list of backup codes with a copy button and a save-now warning. */
function BackupCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true);
  };
  return (
    <Alert severity="warning" sx={{ '& code': { fontFamily: 'monospace' } }}>
      <Typography variant="body2" gutterBottom>
        Save these backup codes now — they’re shown only once.
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 0.5,
          fontFamily: 'monospace',
          my: 1,
        }}
      >
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </Box>
      <Button size="small" onClick={copy}>
        {copied ? 'Copied' : 'Copy codes'}
      </Button>
    </Alert>
  );
}

/**
 * Password-confirmation dialog used by the disable / regenerate actions. The
 * `action` returns the API result so `onDone` can surface new backup codes. A
 * wrong password 401 surfaces inline here (the client passes `skipAuthHandler`).
 */
function PasswordDialog<T>({
  open,
  title,
  confirmLabel,
  confirmColor,
  onClose,
  action,
  onDone,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  confirmColor?: 'error' | 'primary';
  onClose: () => void;
  action: (password: string) => Promise<T>;
  onDone: (result: T) => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => action(password),
    onSuccess: (result) => {
      onDone(result);
      close();
    },
    onError: (err) => setError(toMessage(err)),
  });

  const close = () => {
    setPassword('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          mutation.mutate();
        }}
      >
        <DialogContent>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography variant="body2" color="text.secondary">
              Confirm your account password to continue.
            </Typography>
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              autoFocus
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="contained" color={confirmColor} disabled={mutation.isPending}>
            {mutation.isPending ? 'Working…' : confirmLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
