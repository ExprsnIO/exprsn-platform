/**
 * Public org signup wizard — /signup, a top-level anonymous route (no app shell,
 * no auth guard), same pattern/chrome as the accept-invite landing. Registers an
 * owner account AND provisions their organization via the shared provisioning
 * engine (FEAT-033).
 *
 * Policy-gated entry: it first reads the platform signup policy and, if
 * self-service registration is disabled, renders an info notice and NO form
 * (fail-closed on the client, mirroring the server's 403-before-any-write gate).
 *
 * Three steps — account → organization → review. On success the server either:
 *   - 201: provisioned + issued a session/bearer → setSession + drop into the app
 *     (the same terminal move as LoginPage.finish());
 *   - 202: held the org pending email verification → show a "check your email"
 *     notice (no session is established).
 */
import { useMemo, useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Link,
  Radio, Stack, Step, StepLabel, Stepper, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { authApi, isSignupPending, type SignupResult } from '@/api/auth';
import { toMessage } from '@/lib/errors';
import { useAppStore } from '@/app/store';

// Public self-service signup is limited to team/personal. 'enterprise' (its own
// intermediate CA, unlimited members) is admin-provisioned only — the server
// rejects an anonymous enterprise signup — so it is not offered here.
type OrgType = 'team' | 'personal';

const ORG_TEMPLATES: Array<{ key: OrgType; label: string; description: string }> = [
  {
    key: 'team',
    label: 'Team',
    description:
      'A collaborative workspace with groups and channels. Best for a single team or project.',
  },
  {
    key: 'personal',
    label: 'Personal',
    description: 'A lightweight personal workspace for an individual account.',
  },
];

// Mirrors the server password policy (Joi signupSchema): ≥8 chars with an
// upper-case letter, a lower-case letter, a number, and a special char (@$!%*?&).
const PW_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Derive a URL-safe slug suggestion from the org name (lower, hyphenated). */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

const STEPS = ['Account', 'Organization', 'Review'];

export function SignupWizardPage() {
  const navigate = useNavigate();
  const setSession = useAppStore((s) => s.setSession);

  const policy = useQuery({ queryKey: ['auth', 'signup-policy'], queryFn: () => authApi.signupPolicy() });

  const [activeStep, setActiveStep] = useState(0);
  // Account
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  // Organization
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<OrgType>('team');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);

  const emailValid = EMAIL_PATTERN.test(email);
  const pwValid = PW_PATTERN.test(password);
  const pwMatch = password.length > 0 && password === confirm;
  const slugValue = slugTouched ? slug : slugify(orgName);
  const slugValid = slugValue === '' || /^[a-z0-9-]+$/.test(slugValue);

  const accountValid = emailValid && pwValid && pwMatch;
  const orgValid = orgName.trim().length > 0 && slugValid;

  const submit = useMutation({
    mutationFn: () =>
      authApi.signupOrg({
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
        org: {
          name: orgName.trim(),
          type: orgType,
          slug: slugValue || undefined,
          description: description.trim() || undefined,
        },
      }),
    onSuccess: (res: SignupResult) => {
      if (isSignupPending(res)) {
        setPendingMsg(
          res.message || 'Check your email to verify your address and finish setting up your organization.',
        );
        return;
      }
      setSession(res.user, res.token);
      navigate('/', { replace: true });
    },
    onError: (err) => setError(toMessage(err)),
  });

  const next = () => {
    setError(null);
    setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => {
    setError(null);
    setActiveStep((s) => Math.max(s - 1, 0));
  };

  const selectedTemplate = useMemo(() => ORG_TEMPLATES.find((t) => t.key === orgType)!, [orgType]);

  // --- policy-gated shell ------------------------------------------------
  const renderBody = () => {
    if (policy.isLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      );
    }
    if (policy.isError) {
      return <Alert severity="error">{toMessage(policy.error)}</Alert>;
    }
    if (!policy.data?.allowUserRegistration) {
      return (
        <Stack spacing={2}>
          <Alert severity="info">
            Self-service sign-up is currently disabled for this platform. Please contact your
            administrator for an invitation.
          </Alert>
          <Typography variant="body2" align="center" color="text.secondary">
            Already have an account?{' '}
            <Link component={RouterLink} to="/login">Sign in</Link>
          </Typography>
        </Stack>
      );
    }

    if (pendingMsg) {
      return (
        <Stack spacing={2}>
          <Alert severity="success">{pendingMsg}</Alert>
          <Typography variant="body2" color="text.secondary">
            Your account for <strong>{email}</strong> was created and your organization
            “{orgName}” will be set up automatically once you confirm your email.
          </Typography>
          <Button component={RouterLink} to="/login" variant="outlined" fullWidth>
            Back to sign in
          </Button>
        </Stack>
      );
    }

    const busy = submit.isPending;

    return (
      <Stack spacing={3}>
        <Stepper activeStep={activeStep} alternativeLabel>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && <Alert severity="error">{error}</Alert>}

        {activeStep === 0 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (accountValid) next();
            }}
          >
            <Stack spacing={2}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                error={email.length > 0 && !emailValid}
                helperText={email.length > 0 && !emailValid ? 'Enter a valid email address.' : ' '}
                required
                autoFocus
                fullWidth
              />
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
                error={password.length > 0 && !pwValid}
                helperText="At least 8 characters with upper- and lower-case, a number, and a special character (@$!%*?&)."
                required
                fullWidth
              />
              <TextField
                label="Confirm password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                error={confirm.length > 0 && !pwMatch}
                helperText={confirm.length > 0 && !pwMatch ? 'Passwords do not match.' : ' '}
                required
                fullWidth
              />
              <Button type="submit" variant="contained" disabled={!accountValid} fullWidth>
                Continue
              </Button>
            </Stack>
          </form>
        )}

        {activeStep === 1 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (orgValid) next();
            }}
          >
            <Stack spacing={2}>
              <TextField
                label="Organization name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                autoFocus
                fullWidth
              />

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Organization type
                </Typography>
                <Stack spacing={1}>
                  {ORG_TEMPLATES.map((t) => (
                    <Card
                      key={t.key}
                      variant="outlined"
                      onClick={() => setOrgType(t.key)}
                      sx={{
                        cursor: 'pointer',
                        borderColor: orgType === t.key ? 'primary.main' : undefined,
                        bgcolor: orgType === t.key ? 'action.selected' : undefined,
                      }}
                    >
                      <CardContent sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Radio checked={orgType === t.key} value={t.key} sx={{ p: 0, mt: 0.25 }} />
                        <Box>
                          <Typography variant="body1">{t.label}</Typography>
                          <Typography variant="body2" color="text.secondary">{t.description}</Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </Box>

              <TextField
                label="Slug"
                value={slugValue}
                onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
                error={!!slugValue && !slugValid}
                helperText={
                  !!slugValue && !slugValid
                    ? 'Lowercase letters, numbers and hyphens only.'
                    : 'Used in URLs; leave as suggested or customize. Must be unique.'
                }
                fullWidth
              />
              <TextField
                label="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                multiline
                minRows={2}
                fullWidth
              />

              <Stack direction="row" spacing={1}>
                <Button onClick={back} fullWidth>Back</Button>
                <Button type="submit" variant="contained" disabled={!orgValid} fullWidth>
                  Continue
                </Button>
              </Stack>
            </Stack>
          </form>
        )}

        {activeStep === 2 && (
          <Stack spacing={2}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" gutterBottom>Account</Typography>
                <Row label="Email" value={email} />
                {displayName.trim() && <Row label="Display name" value={displayName.trim()} />}
                <Divider sx={{ my: 1.5 }} />
                <Typography variant="subtitle2" gutterBottom>Organization</Typography>
                <Row label="Name" value={orgName.trim()} />
                <Row label="Type" value={selectedTemplate.label} />
                <Row label="Slug" value={slugValue || '(auto)'} />
                {description.trim() && <Row label="Description" value={description.trim()} />}
              </CardContent>
            </Card>

            <Typography variant="body2" color="text.secondary">
              Creating your account provisions “{orgName.trim()}” as {selectedTemplate.label} and makes
              you its owner.
            </Typography>

            <Stack direction="row" spacing={1}>
              <Button onClick={back} disabled={busy} fullWidth>Back</Button>
              <Button
                variant="contained"
                disabled={busy || !accountValid || !orgValid}
                onClick={() => { setError(null); submit.mutate(); }}
                fullWidth
              >
                {busy ? 'Creating…' : 'Create account & organization'}
              </Button>
            </Stack>
          </Stack>
        )}

        <Typography variant="body2" align="center" color="text.secondary">
          Already have an account?{' '}
          <Link component={RouterLink} to="/login">Sign in</Link>
        </Typography>
      </Stack>
    );
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: 'background.default' }}>
      <Card sx={{ width: '100%', maxWidth: 560 }}>
        <CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="overline" color="text.secondary">Exprsn</Typography>
              <Typography variant="h5">Create your organization</Typography>
              <Typography variant="body2" color="text.secondary">
                Set up an owner account and provision your workspace in a few steps.
              </Typography>
            </Box>
            {renderBody()}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={2} sx={{ py: 0.25 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>{label}</Typography>
      <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{value}</Typography>
    </Stack>
  );
}
