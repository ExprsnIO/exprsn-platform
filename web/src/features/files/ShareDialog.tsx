import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { toMessage } from '@/lib/errors';
import { filevaultApi, type CreateShareInput, type FileItem, type ShareLink } from '@/api/filevault';
import { datetimeToExpiresIn, formatDate } from './util';

type Permission = 'read' | 'write';

export function ShareDialog({
  file,
  open,
  onClose,
  onToast,
}: {
  file: FileItem;
  open: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const sharesKey = ['filevault', 'shares', file.id] as const;

  const [expiresAt, setExpiresAt] = useState<string>('');
  const [maxUses, setMaxUses] = useState<string>('');
  const [permission, setPermission] = useState<Permission>('read');

  const shares = useQuery({
    queryKey: sharesKey,
    queryFn: () => filevaultApi.listShares(file.id),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const input: CreateShareInput = {
        permissions: { read: true, write: permission === 'write', delete: false },
      };
      const expiresIn = datetimeToExpiresIn(expiresAt);
      if (expiresIn) input.expiresIn = expiresIn;
      const uses = parseInt(maxUses, 10);
      if (!Number.isNaN(uses) && uses > 0) input.maxUses = uses;
      return filevaultApi.createShare(file.id, input);
    },
    onSuccess: (res) => {
      // The token IS the capability — the copied link must carry it.
      void navigator.clipboard?.writeText(filevaultApi.shareAppUrl(res.shareLink.id, res.token.id));
      onToast('Share link created and copied to clipboard');
      qc.invalidateQueries({ queryKey: sharesKey });
    },
    onError: (err) => onToast(toMessage(err)),
  });

  const revokeMutation = useMutation({
    mutationFn: (shareId: string) => filevaultApi.revokeShare(shareId),
    onSuccess: () => {
      onToast('Share link revoked');
      qc.invalidateQueries({ queryKey: sharesKey });
    },
    onError: (err) => onToast(toMessage(err)),
  });

  // Direct per-file access token (Vault-style): mint a file-scoped CA token and
  // copy a ready-to-use download URL — no share-link row.
  const accessTokenMutation = useMutation({
    mutationFn: () => filevaultApi.createFileAccessToken(file.id, { expiresIn: 86400 }),
    onSuccess: (res) => {
      const url = filevaultApi.fileTokenDownloadUrl(file.id, res.tokenId);
      void navigator.clipboard?.writeText(url);
      onToast('Direct download link created and copied (valid 24h)');
    },
    onError: (err) => onToast(toMessage(err)),
  });

  const copyLink = (s: ShareLink) => {
    if (!s.tokenId) {
      onToast('This link is missing its access token and cannot be copied');
      return;
    }
    void navigator.clipboard?.writeText(filevaultApi.shareAppUrl(s.id, s.tokenId));
    onToast('Link copied');
  };

  const list = shares.data?.shareLinks ?? [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ wordBreak: 'break-all' }}>Share “{file.name}”</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Anyone with the link can access this file until it expires, reaches its use
            limit, or you revoke it. Each link is backed by a revocable CA token.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              fullWidth
              size="small"
              type="datetime-local"
              label="Expires"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Max uses (optional)"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              inputProps={{ min: 1 }}
            />
          </Stack>

          <TextField
            select
            fullWidth
            size="small"
            label="Permission"
            value={permission}
            onChange={(e) => setPermission(e.target.value as Permission)}
          >
            <MenuItem value="read">Read only</MenuItem>
            <MenuItem value="write">Read &amp; write</MenuItem>
          </TextField>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button
              variant="contained"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating…' : 'Create share link'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => accessTokenMutation.mutate()}
              disabled={accessTokenMutation.isPending}
            >
              {accessTokenMutation.isPending ? 'Creating…' : 'Direct download link (24h)'}
            </Button>
          </Stack>

          <Divider />

          <Typography variant="subtitle2">Active links</Typography>
          {shares.isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress size={22} />
            </Box>
          )}
          {shares.isError && <Alert severity="error">{toMessage(shares.error)}</Alert>}
          {shares.isSuccess && list.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No active share links.
            </Typography>
          )}
          {list.length > 0 && (
            <List dense disablePadding>
              {list.map((s) => {
                const uses = s.maxUses
                  ? `${s.useCount ?? 0}/${s.maxUses} uses`
                  : `${s.useCount ?? 0} uses`;
                const exp = s.expiresAt ? `expires ${formatDate(s.expiresAt)}` : 'never expires';
                return (
                  <ListItem
                    key={s.id}
                    disableGutters
                    secondaryAction={
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Copy link">
                          <IconButton aria-label="Copy link" edge="end" size="small" onClick={() => copyLink(s)}>
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Revoke">
                          <IconButton aria-label="Revoke"
                            edge="end"
                            size="small"
                            color="error"
                            disabled={revokeMutation.isPending}
                            onClick={() => revokeMutation.mutate(s.id)}
                          >
                            <LinkOffIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    }
                  >
                    <ListItemText
                      primary={`${s.permissions?.write ? 'read/write' : 'read-only'} · ${uses}`}
                      secondary={exp}
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
