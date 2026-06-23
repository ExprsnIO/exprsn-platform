import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
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
import { formatDate } from './util';

// Expiry presets in seconds (null = never expires).
const EXPIRY_OPTIONS: { label: string; value: number | '' }[] = [
  { label: 'Never', value: '' },
  { label: '1 hour', value: 3600 },
  { label: '1 day', value: 86400 },
  { label: '7 days', value: 604800 },
  { label: '30 days', value: 2592000 },
];

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

  const [expiresIn, setExpiresIn] = useState<number | ''>('');
  const [maxUses, setMaxUses] = useState<string>('');
  const [allowWrite, setAllowWrite] = useState(false);

  const shares = useQuery({
    queryKey: sharesKey,
    queryFn: () => filevaultApi.listShares(file.id),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const input: CreateShareInput = {
        permissions: { read: true, write: allowWrite, delete: false },
      };
      if (expiresIn !== '') input.expiresIn = expiresIn;
      const uses = parseInt(maxUses, 10);
      if (!Number.isNaN(uses) && uses > 0) input.maxUses = uses;
      return filevaultApi.createShare(file.id, input);
    },
    onSuccess: (res) => {
      void navigator.clipboard?.writeText(filevaultApi.shareDownloadUrl(res.shareLink.id));
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

  const copyLink = (s: ShareLink) => {
    void navigator.clipboard?.writeText(filevaultApi.shareDownloadUrl(s.id));
    onToast('Link copied');
  };

  const list = shares.data?.shareLinks ?? [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Share “{file.name}”</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Anyone with the link can download this file until it expires, reaches its
            use limit, or you revoke it. Each link is backed by a revocable CA token.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              fullWidth
              size="small"
              label="Expires"
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value === '' ? '' : Number(e.target.value))}
            >
              {EXPIRY_OPTIONS.map((o) => (
                <MenuItem key={o.label} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
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

          <FormControlLabel
            control={<Checkbox checked={allowWrite} onChange={(e) => setAllowWrite(e.target.checked)} />}
            label="Allow the recipient to modify the file (write)"
          />

          <Button
            variant="contained"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating…' : 'Create share link'}
          </Button>

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
                const uses = s.maxUses ? `${s.useCount ?? 0}/${s.maxUses} uses` : `${s.useCount ?? 0} uses`;
                const exp = s.expiresAt ? `expires ${formatDate(s.expiresAt)}` : 'never expires';
                return (
                  <ListItem
                    key={s.id}
                    disableGutters
                    secondaryAction={
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Copy link">
                          <IconButton edge="end" size="small" onClick={() => copyLink(s)}>
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Revoke">
                          <IconButton
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
