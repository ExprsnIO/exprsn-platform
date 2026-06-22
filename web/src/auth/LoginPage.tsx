import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams, Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { authApi, isMfaChallenge, type LoginSuccess } from '@/api/auth';
import { ApiError } from '@/lib/http';
import { useAppStore } from '@/app/store';

type Step = 'credentials' | 'mfa';

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnUrl = params.get('returnUrl') || '/';
  const setSession = useAppStore((s) => s.setSession);

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = (res: LoginSuccess) => {
    setSession(res.user, res.token);
    navigate(returnUrl, { replace: true });
  };

  const toMessage = (err: unknown) => {
    if (err instanceof ApiError) {
      return err.correlationId ? `${err.message} (ref ${err.correlationId})` : err.message;
    }
    return (err as Error).message || 'Something went wrong';
  };

  const submitCredentials = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await authApi.login(email, password);
      if (isMfaChallenge(res)) {
        setMfaToken(res.mfaToken);
        setStep('mfa');
      } else {
        finish(res);
      }
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitMfa = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      finish(await authApi.verifyMfa(mfaToken, code));
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <div className="login-card">
          <div className="login-logo">
            <span className="logo-icon">E</span>
            Exprsn
          </div>
          <h1 className="login-title">Welcome back</h1>
          <p className="login-subtitle">Sign in to your Exprsn account to continue.</p>

          {error && (
            <Box sx={{ mb: 2 }}>
              <Alert severity="error">{error}</Alert>
            </Box>
          )}

          <Stack spacing={3}>

          {step === 'credentials' ? (
            <form onSubmit={submitCredentials}>
              <Stack spacing={2}>
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                  autoFocus
                  fullWidth
                />
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  fullWidth
                />
                <Button type="submit" variant="contained" disabled={busy} fullWidth>
                  {busy ? 'Signing in…' : 'Sign in'}
                </Button>
              </Stack>
            </form>
          ) : (
            <form onSubmit={submitMfa}>
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  Enter the 6-digit code from your authenticator (or a backup code).
                </Typography>
                <TextField
                  label="Verification code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="one-time-code"
                  inputProps={{ inputMode: 'numeric' }}
                  required
                  autoFocus
                  fullWidth
                />
                <Button type="submit" variant="contained" disabled={busy} fullWidth>
                  {busy ? 'Verifying…' : 'Verify'}
                </Button>
                <Button onClick={() => setStep('credentials')} disabled={busy} fullWidth>
                  Back
                </Button>
              </Stack>
            </form>
          )}

            <Typography variant="body2" align="center" color="text.secondary">
              Single sign-on?{' '}
              <Link component={RouterLink} to="/sso/callback">
                SSO
              </Link>{' '}
              returns here.
            </Typography>
          </Stack>
        </div>
      </div>

      <div className="login-right">
        <div className="login-promo">
          <h2>One platform. Everything connected.</h2>
          <p>Messaging, timeline, files, groups, live streaming and more — unified behind a single secure sign-on.</p>
        </div>
      </div>
    </div>
  );
}
