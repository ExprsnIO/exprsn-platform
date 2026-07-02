/**
 * Create a low-code app. Scope selection is shown in the standalone studio; the
 * group Apps tab passes a fixed group scope. The backend enforces scope
 * authority (403 if you can't administer the chosen scope).
 */
import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, TextField, MenuItem, Alert,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { lowcodeApi, type ScopeType, type LcApp } from '@/api/lowcode';
import { toMessage } from '@/lib/errors';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (app: LcApp) => void;
  fixedScope?: { scopeType: ScopeType; scopeId: string };
}

const SCOPES: ScopeType[] = ['platform', 'organization', 'group', 'user'];

export default function CreateAppDialog({ open, onClose, onCreated, fixedScope }: Props) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [scopeType, setScopeType] = useState<ScopeType>(fixedScope?.scopeType ?? 'platform');
  const [scopeId, setScopeId] = useState(fixedScope?.scopeId ?? '');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => lowcodeApi.createApp({
      key: key.trim(), name: name.trim(),
      scopeType: fixedScope?.scopeType ?? scopeType,
      scopeId: fixedScope?.scopeId ?? (scopeType === 'platform' ? null : scopeId.trim() || null),
    }),
    onSuccess: (res) => onCreated(res.app),
    onError: (e) => setError(toMessage(e)),
  });

  const needsScopeId = !fixedScope && scopeType !== 'platform';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New app</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Key" fullWidth value={key} onChange={(e) => setKey(e.target.value)} helperText="Lowercase identifier, e.g. helpdesk" />
          <TextField label="Name" fullWidth value={name} onChange={(e) => setName(e.target.value)} />
          {!fixedScope && (
            <TextField select label="Scope" fullWidth value={scopeType} onChange={(e) => setScopeType(e.target.value as ScopeType)}>
              {SCOPES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
          )}
          {needsScopeId && (
            <TextField label={`${scopeType} id`} fullWidth value={scopeId} onChange={(e) => setScopeId(e.target.value)} helperText={`The ${scopeType} this app belongs to`} />
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={create.isPending || !key.trim() || !name.trim()} onClick={() => { setError(null); create.mutate(); }}>Create</Button>
      </DialogActions>
    </Dialog>
  );
}
