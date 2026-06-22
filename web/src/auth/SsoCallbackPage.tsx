import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import { authApi } from '@/api/auth';
import { ApiError } from '@/lib/http';
import { useAppStore } from '@/app/store';

/**
 * Landing route for OAuth/SAML browser callbacks. The backend redirects here
 * with either `?code=<one-time exchange code>` or, for MFA users,
 * `?mfa_required=true&mfaToken=...`. We swap the code for the bearer (then load
 * the user), or complete the MFA challenge.
 *
 * NOTE: the backend social/SAML callbacks must redirect to THIS path
 * (/sso/callback) — not /auth/callback, which collides with the /auth API prefix.
 */
export function SsoCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setSession = useAppStore((s) => s.setSession);

  const code = params.get('code');
  const mfaRequired = params.get('mfa_required') === 'true';
  const mfaTokenParam = params.get('mfaToken') || '';
  const errParam = params.get('error');

  const [error, setError] = useState<string | null>(errParam);
  const [busy, setBusy] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const ran = useRef(false);

  const toMessage = (err: unknown) =>
    err instanceof ApiError
      ? err.correlationId
        ? `${err.message} (ref ${err.correlationId})`
        : err.message
      : (err as Error).message;

  useEffect(() => {
    if (ran.current || mfaRequired || errParam || !code) return;
    ran.current = true;
    (async () => {
      try {
        const { token } = await authApi.exchange(code);
        // exchange returns the bearer; the SSO callback already established a
        // session cookie, so /me resolves the user.
        const { user } = await authApi.me();
        setSession(user, token);
        navigate('/', { replace: true });
      } catch (err) {
        setError(toMessage(err));
      }
    })();
  }, [code, mfaRequired, errParam, navigate, setSession]);

  const submitMfa = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await authApi.verifyMfa(mfaTokenParam, mfaCode);
      setSession(res.user, res.token);
      navigate('/', { replace: true });
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh', p: 2 }}>
      <Paper sx={{ p: 4, width: '100%', maxWidth: 400 }} variant="outlined">
        <Stack spacing={2}>
          <Typography variant="h6" align="center">
            Completing sign-in
          </Typography>
          {error && (
            <Alert severity="error" action={<Button onClick={() => navigate('/login')}>Login</Button>}>
              {error}
            </Alert>
          )}
          {!error && mfaRequired && (
            <form onSubmit={submitMfa}>
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  Enter your authenticator code to finish.
                </Typography>
                <TextField
                  label="Verification code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  inputProps={{ inputMode: 'numeric' }}
                  autoFocus
                  required
                  fullWidth
                />
                <Button type="submit" variant="contained" disabled={busy} fullWidth>
                  {busy ? 'Verifying…' : 'Verify'}
                </Button>
              </Stack>
            </form>
          )}
          {!error && !mfaRequired && <CircularProgress sx={{ alignSelf: 'center' }} />}
        </Stack>
      </Paper>
    </Box>
  );
}
