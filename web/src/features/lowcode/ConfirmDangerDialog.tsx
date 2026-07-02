/**
 * Destructive-action confirmation dialog. For irreversible operations (delete an
 * app/entity/flow, truncate an entity's records) the user must type the exact
 * resource name to arm the confirm button — the same guard rail GitHub uses for
 * repo deletion. Reused across the admin console and the /apps studio.
 */
import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';

export interface ConfirmDangerDialogProps {
  open: boolean;
  title: string;
  /** Body copy explaining exactly what will be destroyed. */
  description: React.ReactNode;
  /** The exact string the user must type to arm the action (usually the name/key). */
  confirmPhrase: string;
  confirmLabel?: string;
  /** Extra warning callout (e.g. "this also deletes 1,204 records"). */
  warning?: React.ReactNode;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDangerDialog({
  open, title, description, confirmPhrase, confirmLabel = 'Delete', warning, busy, onCancel, onConfirm,
}: ConfirmDangerDialogProps) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (open) setTyped(''); }, [open]);
  const armed = typed.trim() === confirmPhrase && !busy;

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: 'error.main' }}>{title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2">{description}</Typography>
          {warning && <Alert severity="warning">{warning}</Alert>}
          <Typography variant="body2" color="text.secondary">
            Type <strong>{confirmPhrase}</strong> to confirm.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmPhrase}
            onKeyDown={(e) => { if (e.key === 'Enter' && armed) onConfirm(); }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button color="error" variant="contained" disabled={!armed} onClick={onConfirm}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
