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
  IconButton,
  MenuItem,
  Paper,
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
import VisibilityIcon from '@mui/icons-material/Visibility';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { toMessage } from '@/lib/errors';
import {
  vaultApi,
  type GroupSecret,
  type SecretPermission,
  type ShareSecretBody,
} from '@/api/vault';
import { formatDate } from '@/features/files/util';
import type { GroupTabProps } from './types';

const PERMISSIONS: SecretPermission[] = ['read', 'write', 'manage'];

const PERMISSION_COLOR = (p: SecretPermission) =>
  p === 'manage' ? 'secondary' : p === 'write' ? 'primary' : 'default';

/** True when a grant's expiry is in the past. */
function isExpired(s: GroupSecret): boolean {
  return !!s.expiresAt && new Date(s.expiresAt).getTime() <= Date.now();
}

/**
 * Dialog to share an existing secret with the group. The secret must already
 * exist in the vault (the backend 404s otherwise) — this only creates the grant.
 */
function ShareDialog({
  groupId,
  open,
  onClose,
  onToast,
}: {
  groupId: string;
  open: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [path, setPath] = useState('');
  const [permission, setPermission] = useState<SecretPermission>('read');
  const [expiresAt, setExpiresAt] = useState('');

  const reset = () => {
    setPath('');
    setPermission('read');
    setExpiresAt('');
  };

  const mutation = useMutation({
    mutationFn: () => {
      const body: ShareSecretBody = { permission };
      if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString();
      return vaultApi.shareSecretWithGroup(groupId, path.trim(), body);
    },
    onSuccess: () => {
      onToast(`Shared ${path.trim()} with the group`);
      reset();
      qc.invalidateQueries({ queryKey: ['vault', 'group-secrets', groupId] });
      onClose();
    },
    onError: (err) => onToast(toMessage(err)),
  });

  const canSubmit = path.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Share a secret</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {mutation.isError && <Alert severity="error">{toMessage(mutation.error)}</Alert>}
          <Typography variant="body2" color="text.secondary">
            Grant this group access to an <strong>existing</strong> vault secret. The secret’s
            plaintext is never sent here — only members with manage rights can later reveal it.
          </Typography>
          <TextField
            label="Secret path"
            required
            fullWidth
            placeholder="myapp/db-password"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            helperText="Slash-delimited path of a secret that already exists in the vault"
          />
          <TextField
            select
            label="Permission"
            fullWidth
            value={permission}
            onChange={(e) => setPermission(e.target.value as SecretPermission)}
          >
            {PERMISSIONS.map((p) => (
              <MenuItem key={p} value={p}>
                {p}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Expires (optional)"
            type="datetime-local"
            fullWidth
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            InputLabelProps={{ shrink: true }}
            helperText="Leave blank for a grant that never expires"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!canSubmit} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Sharing…' : 'Share'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Reveal dialog. SECURITY: the plaintext is fetched one-shot on open and held
 * ONLY in this component's local state — it is never written to the TanStack
 * Query cache. It is cleared the moment the dialog closes.
 */
function RevealDialog({
  groupId,
  secret,
  onClose,
  onToast,
}: {
  groupId: string;
  secret: GroupSecret | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-key the dialog per secret so this resets between opens.
  const open = !!secret;

  const handleReveal = async () => {
    if (!secret) return;
    setLoading(true);
    setError(null);
    try {
      // One-shot fetch — deliberately NOT useQuery, so plaintext never lands in
      // the shared query cache. The result lives only in local `value` state.
      const res = await vaultApi.revealGroupSecret(groupId, secret.path);
      setValue(res.data?.value ?? '');
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Scrub the plaintext from memory on close.
    setValue(null);
    setError(null);
    setLoading(false);
    onClose();
  };

  const copy = async () => {
    if (value == null) return;
    try {
      await navigator.clipboard.writeText(value);
      onToast('Copied to clipboard');
    } catch {
      onToast('Copy failed');
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <WarningAmberIcon color="warning" fontSize="small" />
          <span>Reveal secret</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="warning" variant="outlined">
            Revealing exposes the secret’s plaintext value. This action is admin-only and is
            recorded in the server audit log. Don’t leave it on screen.
          </Alert>
          {secret && (
            <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {secret.path}
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {value != null && (
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <Box
                  component="code"
                  sx={{ flex: 1, fontFamily: 'monospace', wordBreak: 'break-all', m: 0 }}
                >
                  {value || '∅'}
                </Box>
                <Tooltip title="Copy">
                  <IconButton size="small" onClick={copy}>
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Paper>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={handleClose}>
          {value != null ? 'Hide' : 'Cancel'}
        </Button>
        {value == null && (
          <Button
            variant="contained"
            color="warning"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <VisibilityIcon />}
            onClick={handleReveal}
          >
            {loading ? 'Revealing…' : 'Reveal plaintext'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

/** Group shared-secrets management (owner/admin only via ctx.can('manageSecrets')). */
export default function SecretsTab({ groupId, ctx }: GroupTabProps) {
  const qc = useQueryClient();
  const canManage = ctx.can('manageSecrets');
  const [toast, setToast] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [revealTarget, setRevealTarget] = useState<GroupSecret | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<GroupSecret | null>(null);

  const query = useQuery({
    queryKey: ['vault', 'group-secrets', groupId],
    queryFn: () => vaultApi.listGroupSecrets(groupId),
    enabled: canManage,
  });

  const revokeMut = useMutation({
    mutationFn: (s: GroupSecret) => vaultApi.revokeGroupSecret(groupId, s.path),
    onSuccess: (_r, s) => {
      setToast(`Revoked group access to ${s.path}`);
      qc.invalidateQueries({ queryKey: ['vault', 'group-secrets', groupId] });
    },
    onError: (err) => setToast(toMessage(err)),
  });

  // Defense in depth: the tab registry already hides this from non-managers, but
  // never render management UI if the capability gate disagrees.
  if (!canManage) {
    return (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        Only group owners and admins can manage shared secrets.
      </Typography>
    );
  }

  const secrets = query.data?.data ?? [];

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          {secrets.length} shared secret{secrets.length === 1 ? '' : 's'}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setShareOpen(true)}
        >
          Share a secret
        </Button>
      </Stack>

      <Alert severity="info" variant="outlined">
        These are vault secrets shared with this group. Values are never shown here — use
        <strong> Reveal</strong> to view a plaintext value on demand (admin-only and audited).
      </Alert>

      {query.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress size={26} />
        </Box>
      )}
      {query.isError && <Alert severity="error">{toMessage(query.error)}</Alert>}

      {query.isSuccess &&
        (secrets.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
            <Typography color="text.secondary">
              No secrets shared with this group yet.
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Path</TableCell>
                  <TableCell>Permission</TableCell>
                  <TableCell>Shared by</TableCell>
                  <TableCell>Expires</TableCell>
                  <TableCell>Shared</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {secrets.map((s) => {
                  const expired = isExpired(s);
                  const isRevoking =
                    revokeMut.isPending && revokeMut.variables?.secretId === s.secretId;
                  return (
                    <TableRow key={s.secretId} hover>
                      <TableCell sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {s.path}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          color={PERMISSION_COLOR(s.permission)}
                          label={s.permission}
                        />
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>{s.grantedBy || '—'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {s.expiresAt ? (
                          <Typography
                            variant="body2"
                            color={expired ? 'error.main' : 'text.secondary'}
                          >
                            {formatDate(s.expiresAt)}
                            {expired ? ' (expired)' : ''}
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.disabled">
                            never
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                        {formatDate(s.grantedAt)}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title="Reveal plaintext">
                          <span>
                            <IconButton
                              size="small"
                              disabled={expired}
                              onClick={() => setRevealTarget(s)}
                            >
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Revoke group access">
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              disabled={isRevoking}
                              onClick={() => setRevokeTarget(s)}
                            >
                              <LinkOffIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ))}

      <ShareDialog
        groupId={groupId}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onToast={setToast}
      />

      <RevealDialog
        key={revealTarget?.secretId ?? 'none'}
        groupId={groupId}
        secret={revealTarget}
        onClose={() => setRevealTarget(null)}
        onToast={setToast}
      />

      <Dialog open={!!revokeTarget} onClose={() => setRevokeTarget(null)} maxWidth="xs">
        <DialogTitle>Revoke group access?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This removes the group’s grant on{' '}
            <Box component="code" sx={{ fontFamily: 'monospace' }}>
              {revokeTarget?.path}
            </Box>
            . The underlying secret is not deleted. This can’t be undone without re-sharing.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setRevokeTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              if (revokeTarget) revokeMut.mutate(revokeTarget);
              setRevokeTarget(null);
            }}
          >
            Revoke
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
