import { useState } from 'react';
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
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  Checkbox,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { toMessage } from '@/lib/errors';
import { formatDate } from '@/features/files/util';
import {
  caUserApi,
  type ExpiryType,
  type GenerateTokenBody,
  type ResourceType,
  type TokenPermissions,
  type UserCertificate,
  type UserToken,
} from '@/api/caUser';

const TOKENS_KEY = ['ca', 'me', 'tokens'] as const;
const CERTS_KEY = ['ca', 'me', 'certificates'] as const;

const STATUS_COLOR: Record<string, 'success' | 'error' | 'warning' | 'default'> = {
  active: 'success',
  revoked: 'error',
  expired: 'warning',
};

const PERM_KEYS: Array<{ key: keyof TokenPermissions; label: string }> = [
  { key: 'read', label: 'R' },
  { key: 'write', label: 'W' },
  { key: 'append', label: 'A' },
  { key: 'delete', label: 'D' },
  { key: 'update', label: 'U' },
];

function permBadges(perms?: TokenPermissions) {
  return (
    <Stack direction="row" spacing={0.5}>
      {PERM_KEYS.map(({ key, label }) => {
        const on = !!perms?.[key];
        return (
          <Box
            key={key}
            sx={{
              width: 18,
              height: 18,
              borderRadius: '4px',
              fontSize: 11,
              lineHeight: '18px',
              textAlign: 'center',
              fontWeight: 700,
              color: on ? 'success.contrastText' : 'text.disabled',
              bgcolor: on ? 'success.main' : 'action.hover',
            }}
          >
            {label}
          </Box>
        );
      })}
    </Stack>
  );
}

function statusChip(status?: string) {
  return (
    <Chip
      size="small"
      variant="outlined"
      color={STATUS_COLOR[status ?? ''] ?? 'default'}
      label={status ?? 'unknown'}
    />
  );
}

const EMPTY_GEN = {
  certificateId: '',
  perms: { read: true, write: false, append: false, delete: false, update: false } as TokenPermissions,
  resourceType: 'url' as ResourceType,
  resourceValue: '',
  expiryType: 'time' as ExpiryType,
  /** Duration in seconds for time-based tokens (converted to an absolute ts). */
  expirySeconds: 3600,
  maxUses: 10,
};

/** Generate-token dialog: pick a token-capable cert, permissions, resource, expiry. */
function GenerateDialog({
  open,
  onClose,
  tokenCerts,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  tokenCerts: UserCertificate[];
  onToast: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_GEN });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => {
      const body: GenerateTokenBody = {
        certificateId: form.certificateId,
        permissions: form.perms,
        resource: { type: form.resourceType, value: form.resourceValue.trim() },
        expiryType: form.expiryType,
      };
      if (form.expiryType === 'time') {
        body.expiresAt = Date.now() + Math.max(1, form.expirySeconds) * 1000;
      } else if (form.expiryType === 'use') {
        body.maxUses = form.maxUses;
      }
      return caUserApi.generateToken(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TOKENS_KEY });
      onToast('Token generated');
      setForm({ ...EMPTY_GEN });
      onClose();
    },
    onError: (e) => onToast(toMessage(e)),
  });

  const anyPerm = PERM_KEYS.some(({ key }) => form.perms[key]);
  const canSubmit =
    !!form.certificateId && anyPerm && form.resourceValue.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Generate token</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {mutation.isError && <Alert severity="error">{toMessage(mutation.error)}</Alert>}

          {tokenCerts.length === 0 ? (
            <Alert severity="warning">
              You have no token-capable certificates. Issue a certificate <em>without</em> a
              passphrase (CA-held key) first.
            </Alert>
          ) : (
            <FormControl fullWidth required>
              <InputLabel id="signing-cert-label">Signing certificate</InputLabel>
              <Select
                labelId="signing-cert-label"
                label="Signing certificate"
                value={form.certificateId}
                onChange={(e) => set('certificateId', e.target.value)}
              >
                {tokenCerts.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.commonName} ({c.type})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Permissions
            </Typography>
            <FormGroup row>
              {PERM_KEYS.map(({ key }) => (
                <FormControlLabel
                  key={key}
                  control={
                    <Checkbox
                      size="small"
                      checked={!!form.perms[key]}
                      onChange={(e) => set('perms', { ...form.perms, [key]: e.target.checked })}
                    />
                  }
                  label={key}
                />
              ))}
            </FormGroup>
          </Box>

          <Stack direction="row" spacing={2}>
            <FormControl sx={{ minWidth: 120 }}>
              <InputLabel id="resource-type-label">Resource type</InputLabel>
              <Select
                labelId="resource-type-label"
                label="Resource type"
                value={form.resourceType}
                onChange={(e) => set('resourceType', e.target.value as ResourceType)}
              >
                <MenuItem value="url">url</MenuItem>
                <MenuItem value="did">did</MenuItem>
                <MenuItem value="cid">cid</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Resource value"
              fullWidth
              required
              value={form.resourceValue}
              onChange={(e) => set('resourceValue', e.target.value)}
            />
          </Stack>

          <Stack direction="row" spacing={2}>
            <FormControl sx={{ minWidth: 140 }}>
              <InputLabel id="expiry-type-label">Expiry</InputLabel>
              <Select
                labelId="expiry-type-label"
                label="Expiry"
                value={form.expiryType}
                onChange={(e) => set('expiryType', e.target.value as ExpiryType)}
              >
                <MenuItem value="time">time</MenuItem>
                <MenuItem value="use">use</MenuItem>
                <MenuItem value="persistent">persistent</MenuItem>
              </Select>
            </FormControl>
            {form.expiryType === 'time' && (
              <TextField
                label="Expires in (seconds)"
                type="number"
                fullWidth
                value={form.expirySeconds}
                onChange={(e) => set('expirySeconds', Number(e.target.value))}
                inputProps={{ min: 1 }}
              />
            )}
            {form.expiryType === 'use' && (
              <TextField
                label="Max uses"
                type="number"
                fullWidth
                value={form.maxUses}
                onChange={(e) => set('maxUses', Number(e.target.value))}
                inputProps={{ min: 1 }}
              />
            )}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!canSubmit} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Generating…' : 'Generate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Token introspection detail dialog. */
function IntrospectDialog({ token, onClose }: { token: UserToken | null; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['ca', 'me', 'token-introspect', token?.id],
    queryFn: () => caUserApi.introspectToken(token!.id),
    enabled: !!token,
  });

  return (
    <Dialog open={!!token} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Token {token?.id.slice(0, 8)}…</DialogTitle>
      <DialogContent dividers>
        {query.isLoading && <CircularProgress size={20} />}
        {query.isError && <Alert severity="error">{toMessage(query.error)}</Alert>}
        {query.data && (
          <Box
            component="pre"
            sx={{
              m: 0,
              fontFamily: 'monospace',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {JSON.stringify(query.data.introspection, null, 2)}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export function TokensTab() {
  const qc = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [introspectToken, setIntrospectToken] = useState<UserToken | null>(null);
  // Refresh dialog.
  const [refreshToken, setRefreshToken] = useState<UserToken | null>(null);
  const [refreshSeconds, setRefreshSeconds] = useState(3600);
  // Revoke confirm.
  const [revokeToken, setRevokeToken] = useState<UserToken | null>(null);

  const query = useQuery({ queryKey: TOKENS_KEY, queryFn: () => caUserApi.listTokens() });
  const certQuery = useQuery({
    queryKey: CERTS_KEY,
    queryFn: () => caUserApi.listCertificates({ limit: 100 }),
  });

  // Token-capable certs are the user's active certs (password certs cannot sign,
  // but the list response doesn't expose that flag, so the backend enforces it).
  const tokenCerts = (certQuery.data?.certificates ?? []).filter((c) => c.status === 'active');
  const certName = (id?: string) =>
    tokenCerts.find((c) => c.id === id)?.commonName ?? (id ? `${id.slice(0, 8)}…` : '—');

  const revokeMutation = useMutation({
    mutationFn: () => caUserApi.revokeToken(revokeToken!.id, 'User requested revocation'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TOKENS_KEY });
      setToast('Token revoked');
      setRevokeToken(null);
    },
    onError: (e) => setToast(toMessage(e)),
  });

  const refreshMutation = useMutation({
    mutationFn: () =>
      caUserApi.refreshToken(refreshToken!.id, Date.now() + Math.max(1, refreshSeconds) * 1000),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TOKENS_KEY });
      setToast('Token expiry refreshed');
      setRefreshToken(null);
    },
    onError: (e) => setToast(toMessage(e)),
  });

  const tokens = query.data?.tokens ?? [];

  return (
    <Stack spacing={2} sx={{ pb: 4 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h6">Tokens</Typography>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setGenOpen(true)}>
          Generate token
        </Button>
      </Stack>

      <Alert severity="info" variant="outlined">
        Each token is signed by one of your certificates. Revoking that certificate revokes its
        tokens.
      </Alert>

      {query.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}
      {query.isError && <Alert severity="error">{toMessage(query.error)}</Alert>}

      {query.isSuccess &&
        (tokens.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
            <Typography color="text.secondary">No tokens yet.</Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Token</TableCell>
                  <TableCell>Signing cert</TableCell>
                  <TableCell>Permissions</TableCell>
                  <TableCell>Resource</TableCell>
                  <TableCell>Expiry</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tokens.map((t) => (
                  <TableRow key={t.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {t.id.slice(0, 8)}…
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{certName(t.certificateId)}</TableCell>
                    <TableCell>{permBadges(t.permissions)}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                      {t.resourceType}:{t.resourceValue}
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {t.expiryType === 'time'
                        ? formatDate(t.expiresAt)
                        : t.expiryType === 'use'
                          ? `${t.usesRemaining ?? '?'} uses left`
                          : t.expiryType}
                    </TableCell>
                    <TableCell>{statusChip(t.status)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Introspect">
                        <IconButton size="small" onClick={() => setIntrospectToken(t)}>
                          <InfoOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t.expiryType === 'time' ? 'Refresh expiry' : 'Refresh (time-based only)'}>
                        <span>
                          <IconButton
                            size="small"
                            disabled={t.status !== 'active' || t.expiryType !== 'time'}
                            onClick={() => {
                              setRefreshSeconds(3600);
                              setRefreshToken(t);
                            }}
                          >
                            <AutorenewIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Revoke">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={t.status !== 'active'}
                            onClick={() => setRevokeToken(t)}
                          >
                            <BlockIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ))}

      <GenerateDialog
        open={genOpen}
        onClose={() => setGenOpen(false)}
        tokenCerts={tokenCerts}
        onToast={setToast}
      />

      <IntrospectDialog token={introspectToken} onClose={() => setIntrospectToken(null)} />

      {/* Refresh dialog */}
      <Dialog open={!!refreshToken} onClose={() => setRefreshToken(null)} fullWidth maxWidth="xs">
        <DialogTitle>Refresh token expiry</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Set a new expiry, measured from now. Time-based tokens only.
          </DialogContentText>
          <TextField
            label="Expires in (seconds)"
            type="number"
            fullWidth
            value={refreshSeconds}
            onChange={(e) => setRefreshSeconds(Number(e.target.value))}
            inputProps={{ min: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setRefreshToken(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={refreshMutation.isPending}
            onClick={() => refreshMutation.mutate()}
          >
            {refreshMutation.isPending ? 'Refreshing…' : 'Refresh'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Revoke confirm */}
      <Dialog open={!!revokeToken} onClose={() => setRevokeToken(null)} fullWidth maxWidth="xs">
        <DialogTitle>Revoke token</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Revoke token {revokeToken?.id.slice(0, 8)}…? This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setRevokeToken(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={revokeMutation.isPending}
            onClick={() => revokeMutation.mutate()}
          >
            {revokeMutation.isPending ? 'Revoking…' : 'Revoke'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Stack>
  );
}
