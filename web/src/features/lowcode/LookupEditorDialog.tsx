/**
 * Lookup editor — create/edit a reusable lookup list. Supports both static value
 * lists ([{ value, label, color }]) and dynamic provider-backed lookups (users,
 * groups, queues, …) resolved at runtime. Save is delegated via `onSave`.
 */
import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem,
  Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { Lookup, LookupValue, LookupSource } from '@/api/admin/lowcode';
import { useCatalog } from './catalog';

const KEY_RE = /^[a-z][a-z0-9_-]*$/;

export interface LookupEditorDialogProps {
  open: boolean;
  lookup: Lookup | null;
  /** appId for a new lookup (null = platform-global; admin only). */
  appId: string | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (payload: Partial<Lookup>) => void;
}

export function LookupEditorDialog({ open, lookup, appId, busy, onClose, onSave }: LookupEditorDialogProps) {
  const { catalog } = useCatalog();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [sourceType, setSourceType] = useState<'static' | 'provider'>('static');
  const [provider, setProvider] = useState('');
  const [paramsText, setParamsText] = useState('{}');
  const [values, setValues] = useState<LookupValue[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(lookup?.name ?? '');
    setKey(lookup?.key ?? '');
    const src = lookup?.source;
    setSourceType(src?.type === 'provider' ? 'provider' : 'static');
    setProvider(src?.provider ?? '');
    setParamsText(JSON.stringify(src?.params ?? {}, null, 2));
    setValues(lookup?.values ?? []);
    setError(null);
  }, [open, lookup]);

  const patchValue = (i: number, patch: Partial<LookupValue>) =>
    setValues((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  const submit = () => {
    setError(null);
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!lookup && !KEY_RE.test(key)) { setError('Key must be lower-kebab/snake starting with a letter.'); return; }
    let source: LookupSource;
    if (sourceType === 'provider') {
      if (!provider) { setError('Choose a provider.'); return; }
      let params: Record<string, unknown> = {};
      try { params = JSON.parse(paramsText || '{}'); } catch { setError('Provider params is not valid JSON.'); return; }
      source = { type: 'provider', provider, params };
    } else {
      source = { type: 'static' };
    }
    const payload: Partial<Lookup> = { name: name.trim(), values, source };
    if (!lookup) { payload.appId = appId; payload.key = key; }
    onSave(payload);
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{lookup ? `Edit lookup — ${lookup.name}` : 'New lookup'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
          <Stack direction="row" spacing={2}>
            <TextField label="Name" fullWidth value={name} onChange={(e) => setName(e.target.value)} required />
            <TextField label="Key" fullWidth value={key} disabled={!!lookup} onChange={(e) => setKey(e.target.value)} helperText={lookup ? 'immutable' : 'lower-snake'} />
          </Stack>
          <TextField select label="Source" value={sourceType} onChange={(e) => setSourceType(e.target.value as 'static' | 'provider')}>
            <MenuItem value="static">Static list</MenuItem>
            <MenuItem value="provider">Dynamic provider</MenuItem>
          </TextField>

          {sourceType === 'provider' ? (
            <>
              <TextField select label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
                <MenuItem value=""><em>choose…</em></MenuItem>
                {catalog.lookupProviders.map((p) => <MenuItem key={p.key} value={p.key}>{p.label ?? p.key}</MenuItem>)}
              </TextField>
              <TextField label="Provider params (JSON)" multiline minRows={3} value={paramsText} onChange={(e) => setParamsText(e.target.value)} inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }} />
              <Alert severity="info">Provider-backed values are resolved live; the static list below is used as a fallback cache.</Alert>
            </>
          ) : null}

          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">Values ({values.length})</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setValues((vs) => [...vs, { value: '', label: '' }])}>Add value</Button>
            </Stack>
            <Stack spacing={1}>
              {values.length === 0 && <Alert severity="info">No values.</Alert>}
              {values.map((v, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  <TextField label="value" size="small" value={v.value} onChange={(e) => patchValue(i, { value: e.target.value })} sx={{ flex: 1 }} />
                  <TextField label="label" size="small" value={v.label} onChange={(e) => patchValue(i, { label: e.target.value })} sx={{ flex: 1 }} />
                  <TextField label="color" size="small" type="color" value={v.color ?? '#737373'} onChange={(e) => patchValue(i, { color: e.target.value })} sx={{ width: 70 }} />
                  <IconButton size="small" color="error" aria-label={`Delete value ${v.label || v.value || i + 1}`} onClick={() => setValues((vs) => vs.filter((_, j) => j !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Stack>
              ))}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={busy}>{lookup ? 'Save' : 'Create'}</Button>
      </DialogActions>
    </Dialog>
  );
}
