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
  DialogTitle,
  IconButton,
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
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useAppStore } from '@/app/store';
import { toMessage } from '@/lib/errors';
import { vaultApi, type Secret } from '@/api/vault';
import { formatDate } from '@/features/files/util';

const SECRETS_KEY = ['vault', 'secrets'] as const;

export function SecretsPage() {
  const userId = useAppStore((s) => s.user?.id);
  const qc = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ path: '', value: '' });
  // Per-path revealed plaintext + in-flight reveal set.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<Set<string>>(new Set());

  const query = useQuery({ queryKey: SECRETS_KEY, queryFn: vaultApi.listSecrets });

  const createMutation = useMutation({
    mutationFn: () => vaultApi.createSecret(form.path.trim(), form.value),
    onSuccess: () => {
      setToast(`Saved secret ${form.path.trim()}`);
      setForm({ path: '', value: '' });
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: SECRETS_KEY });
    },
    onError: (err) => setToast(toMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (s: Secret) => vaultApi.deleteSecret(s.path),
    onSuccess: (_r, s) => {
      setToast(`Deleted ${s.path}`);
      setRevealed((r) => {
        const next = { ...r };
        delete next[s.path];
        return next;
      });
      qc.invalidateQueries({ queryKey: SECRETS_KEY });
    },
    onError: (err) => setToast(toMessage(err)),
  });

  const reveal = async (s: Secret) => {
    if (revealed[s.path] != null) {
      // toggle hide
      setRevealed((r) => {
        const next = { ...r };
        delete next[s.path];
        return next;
      });
      return;
    }
    setRevealing((set) => new Set(set).add(s.path));
    try {
      const res = await vaultApi.getSecret(s.path);
      setRevealed((r) => ({ ...r, [s.path]: res.data?.value ?? '' }));
    } catch (err) {
      setToast(toMessage(err));
    } finally {
      setRevealing((set) => {
        const next = new Set(set);
        next.delete(s.path);
        return next;
      });
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast('Copied to clipboard');
    } catch {
      setToast('Copy failed');
    }
  };

  if (!userId) return <Alert severity="error">Not signed in.</Alert>;

  const secrets = query.data?.data ?? [];
  const canSubmit = form.path.trim().length > 0 && form.value.length > 0 && !createMutation.isPending;

  return (
    <Stack spacing={2} sx={{ maxWidth: 920, mx: 'auto', pb: 6 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5">Secrets</Typography>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          New secret
        </Button>
      </Stack>

      <Alert severity="info" variant="outlined">
        Values are encrypted at rest with the vault’s <code>default</code> key and revealed on demand.
      </Alert>

      {query.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}
      {query.isError && <Alert severity="error">{toMessage(query.error)}</Alert>}

      {query.isSuccess && secrets.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">No secrets yet. Create your first one.</Typography>
        </Paper>
      ) : (
        secrets.length > 0 && (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Path</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell>Version</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {secrets.map((s) => {
                  const shown = revealed[s.path];
                  const isRevealing = revealing.has(s.path);
                  const isDeleting = deleteMutation.isPending && deleteMutation.variables?.id === s.id;
                  return (
                    <TableRow key={s.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {s.path}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', minWidth: 160 }}>
                        {isRevealing ? (
                          <CircularProgress size={14} />
                        ) : shown != null ? (
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <span style={{ wordBreak: 'break-all' }}>{shown || '∅'}</span>
                            <Tooltip title="Copy">
                              <IconButton aria-label="Copy" size="small" onClick={() => copy(shown)}>
                                <ContentCopyIcon sx={{ fontSize: 15 }} />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        ) : (
                          <Typography variant="body2" color="text.disabled">
                            ••••••••
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{s.version ?? '—'}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          color={s.status === 'active' ? 'success' : 'default'}
                          label={s.status ?? 'unknown'}
                        />
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                        {formatDate(s.updatedAt || s.createdAt)}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title={shown != null ? 'Hide' : 'Reveal'}>
                          <IconButton size="small" aria-label={shown != null ? 'Hide' : 'Reveal'} onClick={() => reveal(s)}>
                            {shown != null ? (
                              <VisibilityOffIcon fontSize="small" />
                            ) : (
                              <VisibilityIcon fontSize="small" />
                            )}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              aria-label={`Delete secret ${s.path}`}
                              disabled={isDeleting}
                              onClick={() => {
                                if (window.confirm(`Delete secret ${s.path}?`)) deleteMutation.mutate(s);
                              }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
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
        )
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New secret</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {createMutation.isError && <Alert severity="error">{toMessage(createMutation.error)}</Alert>}
            <TextField
              label="Path"
              required
              fullWidth
              placeholder="myapp/db-password"
              value={form.path}
              onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))}
              helperText="Slash-delimited path; the last segment is the key"
            />
            <TextField
              label="Value"
              required
              fullWidth
              multiline
              minRows={2}
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" disabled={!canSubmit} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? 'Saving…' : 'Save'}
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
