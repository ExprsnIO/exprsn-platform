import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { useE2eeStore } from '@/lib/e2eeStore';
import { toMessage } from '@/lib/errors';

/**
 * Gates the messaging UI behind E2EE unlock. On first use it walks the user
 * through creating an encryption passphrase (which wraps a freshly generated
 * private key); on later sessions it asks for that passphrase to unwrap the
 * private key into memory. Children render only once `unlocked`.
 */
export function EncryptionGate({ children }: { children: React.ReactNode }) {
  const status = useE2eeStore((s) => s.status);
  const init = useE2eeStore((s) => s.init);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unknown') {
      init().catch((e) => setInitError(toMessage(e)));
    }
  }, [status, init]);

  if (status === 'unlocked') return <>{children}</>;

  if (initError) return <Alert severity="error">{initError}</Alert>;

  if (status === 'unknown') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return <PassphraseForm mode={status === 'needs-setup' ? 'setup' : 'unlock'} />;
}

function PassphraseForm({ mode }: { mode: 'setup' | 'unlock' }) {
  const setup = useE2eeStore((s) => s.setup);
  const unlock = useE2eeStore((s) => s.unlock);

  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSetup = mode === 'setup';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (passphrase.length < 8) {
      setError('Use a passphrase of at least 8 characters.');
      return;
    }
    if (isSetup && passphrase !== confirm) {
      setError('Passphrases do not match.');
      return;
    }

    setBusy(true);
    try {
      if (isSetup) await setup(passphrase);
      else await unlock(passphrase);
    } catch (err) {
      setError(
        isSetup
          ? toMessage(err)
          : 'Could not unlock — check your passphrase and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
      <Paper variant="outlined" sx={{ p: 4, maxWidth: 460, width: '100%' }}>
        <form onSubmit={submit}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <LockIcon color="primary" />
              <Typography variant="h6">
                {isSetup ? 'Set up encrypted messaging' : 'Unlock encrypted messaging'}
              </Typography>
            </Stack>

            <Typography variant="body2" color="text.secondary">
              {isSetup
                ? 'Choose an encryption passphrase. It protects your private key and is never sent to the server. You will need it to read your messages on any device — it cannot be recovered if lost.'
                : 'Enter your encryption passphrase to decrypt your messages on this device.'}
            </Typography>

            <TextField
              type="password"
              label="Passphrase"
              fullWidth
              autoFocus
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />

            {isSetup && (
              <TextField
                type="password"
                label="Confirm passphrase"
                fullWidth
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            )}

            {error && <Alert severity="error">{error}</Alert>}

            <Button type="submit" variant="contained" disabled={busy}>
              {busy
                ? isSetup
                  ? 'Generating keys…'
                  : 'Unlocking…'
                : isSetup
                  ? 'Create passphrase'
                  : 'Unlock'}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
