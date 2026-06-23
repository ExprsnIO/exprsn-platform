import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { atprotoApi, type DidChallenge, type LinkDidsPayload } from '@/api/atproto';
import { toMessage } from '@/lib/errors';

/**
 * Decentralized identifiers (DIDs) for the signed-in user.
 *  - did:exprsn is platform-minted (self-certifying) and shown read-only.
 *  - did:web / did:plc are linked by the user, then proven via a one-time
 *    challenge token (a .well-known file for did:web, or the Bluesky profile
 *    description for did:plc). Verified shows a green chip.
 */
export function UserDids({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['user-dids', userId],
    queryFn: () => atprotoApi.getUserDids(userId),
  });

  const [didWeb, setDidWeb] = useState('');
  const [didPlc, setDidPlc] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [challenge, setChallenge] = useState<DidChallenge | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  const linkMutation = useMutation({
    mutationFn: (patch: LinkDidsPayload) => atprotoApi.linkUserDids(userId, patch),
    onSuccess: (res) => {
      queryClient.setQueryData(['user-dids', userId], res);
      setFormError(null);
      setDone(true);
      setDidWeb('');
      setDidPlc('');
    },
    onError: (err) => {
      setDone(false);
      setFormError(toMessage(err));
    },
  });

  const challengeMutation = useMutation({
    mutationFn: () => atprotoApi.issueChallenge(userId),
    onSuccess: (res) => {
      setChallenge(res);
      setVerifyMsg(null);
      queryClient.invalidateQueries({ queryKey: ['user-dids', userId] });
    },
    onError: (err) => setFormError(toMessage(err)),
  });

  const verifyMutation = useMutation({
    mutationFn: (method: 'web' | 'plc') => atprotoApi.verifyControl(userId, method),
    onSuccess: (res) => {
      if (res.verified) {
        setVerifyMsg(`Verified via ${res.method}.`);
        setChallenge(null);
        queryClient.invalidateQueries({ queryKey: ['user-dids', userId] });
      } else {
        setVerifyMsg(`Not verified yet (${res.reason ?? 'challenge not found'}).`);
      }
    },
    onError: () => setVerifyMsg('Not verified yet — make sure you published the token, then retry.'),
  });

  if (isLoading) return <CircularProgress />;
  if (error) return <Alert severity="error">{toMessage(error)}</Alert>;

  const dids = data!;

  const verifiedChip = (linked: string | null, verified: boolean, proof: string | null) =>
    linked ? (
      <Chip
        size="small"
        color={verified ? 'success' : 'default'}
        label={verified ? `verified${proof ? ` (${proof})` : ''}` : 'unverified'}
      />
    ) : null;

  const submit = () => {
    setFormError(null);
    const patch: LinkDidsPayload = {};
    if (didWeb.trim()) patch.didWeb = didWeb.trim();
    if (didPlc.trim()) patch.didPlc = didPlc.trim();
    if (!patch.didWeb && !patch.didPlc) return;
    linkMutation.mutate(patch);
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 680 }}>
      <Stack spacing={2}>
        <Typography variant="h6">Decentralized identifiers</Typography>
        <Typography variant="body2" color="text.secondary">
          Your AT-Protocol (Bluesky) identities. <code>did:exprsn</code> is issued by Exprsn; you can
          also link and verify your own <code>did:web</code> and <code>did:plc</code>.
        </Typography>

        {formError && <Alert severity="error">{formError}</Alert>}
        {done && <Alert severity="success">Identifiers updated.</Alert>}

        <TextField
          label="did:exprsn (issued by Exprsn)"
          value={dids.didExprsn ?? ''}
          InputProps={{ readOnly: true }}
          fullWidth
        />

        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            label="did:web"
            value={didWeb || dids.didWeb || ''}
            onChange={(e) => {
              setDidWeb(e.target.value);
              setDone(false);
            }}
            placeholder="did:web:example.com"
            fullWidth
          />
          {verifiedChip(dids.didWeb, dids.didWebVerified, dids.didWebProof)}
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            label="did:plc"
            value={didPlc || dids.didPlc || ''}
            onChange={(e) => {
              setDidPlc(e.target.value);
              setDone(false);
            }}
            placeholder="did:plc:…"
            fullWidth
          />
          {verifiedChip(dids.didPlc, dids.didPlcVerified, dids.didPlcProof)}
        </Stack>

        <Button
          variant="contained"
          onClick={submit}
          disabled={linkMutation.isPending}
          sx={{ alignSelf: 'flex-start' }}
        >
          {linkMutation.isPending ? 'Saving…' : 'Link identifiers'}
        </Button>

        <Divider />

        <Typography variant="subtitle2">Prove ownership</Typography>
        <Typography variant="body2" color="text.secondary">
          Generate a token, publish it (a <code>/.well-known/atproto-did-challenge.txt</code> file for
          did:web, or your Bluesky profile description for did:plc), then verify.
        </Typography>

        {verifyMsg && (
          <Alert severity={verifyMsg.startsWith('Verified') ? 'success' : 'info'}>{verifyMsg}</Alert>
        )}

        {challenge && (
          <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {challenge.token}
            </Typography>
          </Box>
        )}

        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button
            variant="outlined"
            onClick={() => challengeMutation.mutate()}
            disabled={challengeMutation.isPending}
          >
            {challengeMutation.isPending ? 'Generating…' : 'Get challenge token'}
          </Button>
          <Button
            onClick={() => verifyMutation.mutate('web')}
            disabled={!dids.didWeb || verifyMutation.isPending}
          >
            Verify did:web
          </Button>
          <Button
            onClick={() => verifyMutation.mutate('plc')}
            disabled={!dids.didPlc || verifyMutation.isPending}
          >
            Verify did:plc
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
