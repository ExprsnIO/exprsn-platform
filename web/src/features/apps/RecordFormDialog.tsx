/**
 * Auto-generated record form — renders inputs from an entity's typed field defs
 * (decisions ledger: "auto-generate forms from entity/form defs"). Enum fields
 * draw options from resolved lookups; the backend coerces/validates on write.
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, TextField,
  MenuItem, FormControlLabel, Switch, Alert,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { lowcodeApi, type Entity, type Field, type LcRecord, type LookupValue } from '@/api/lowcode';
import { toMessage } from '@/lib/errors';

interface Props {
  open: boolean;
  entity: Entity;
  appKey: string;
  record: LcRecord | null;
  lookupOptions: Record<string, LookupValue[]>;
  onClose: () => void;
  onSaved: () => void;
}

type Values = Record<string, unknown>;

function recordData(record: LcRecord | null): Values {
  if (!record) return {};
  const data = (record as { data?: Values }).data;
  return data && typeof data === 'object' ? { ...data } : {};
}

function enumOptions(field: Field, lookupOptions: Record<string, LookupValue[]>): LookupValue[] {
  if (Array.isArray(field.enumValues) && field.enumValues.length) return field.enumValues.map((v) => ({ value: v, label: v }));
  if (field.enumLookup && lookupOptions[field.enumLookup]) return lookupOptions[field.enumLookup];
  return [];
}

export default function RecordFormDialog({ open, entity, appKey, record, lookupOptions, onClose, onSaved }: Props) {
  const [values, setValues] = useState<Values>({});
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = !!record;

  useEffect(() => { if (open) { setValues(recordData(record)); setFormError(null); } }, [open, record]);

  const set = (key: string, v: unknown) => setValues((prev) => ({ ...prev, [key]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const body: Values = {};
      for (const f of entity.fields) {
        const v = values[f.key];
        if (v === undefined || v === '') continue;
        if (f.type === 'json') {
          try { body[f.key] = typeof v === 'string' ? JSON.parse(v) : v; }
          catch { throw new Error(`"${f.label}" must be valid JSON`); }
        } else {
          body[f.key] = v;
        }
      }
      return isEdit
        ? lowcodeApi.updateRecord(entity.key, appKey, record!.id, body)
        : lowcodeApi.createRecord(entity.key, appKey, body);
    },
    onSuccess: () => onSaved(),
    onError: (e) => setFormError(toMessage(e)),
  });

  const renderField = (f: Field) => {
    const raw = values[f.key];
    const common = { label: f.label + (f.required ? ' *' : ''), fullWidth: true } as const;
    // Computed fields derive server-side on every save — show, never edit.
    if (f.formula !== undefined) {
      return (
        <TextField
          key={f.key} {...common} disabled
          value={raw === undefined || raw === null ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)}
          helperText={`computed: ${f.formula}`}
        />
      );
    }
    switch (f.type) {
      case 'boolean':
        return (
          <FormControlLabel
            key={f.key}
            control={<Switch checked={raw === true || raw === 'true'} onChange={(e) => set(f.key, e.target.checked)} />}
            label={f.label}
          />
        );
      case 'enum':
        return (
          <TextField {...common} select value={(raw as string) ?? ''} onChange={(e) => set(f.key, e.target.value)}>
            <MenuItem value=""><em>—</em></MenuItem>
            {enumOptions(f, lookupOptions).map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
        );
      case 'number':
      case 'integer':
        return <TextField key={f.key} {...common} type="number" value={(raw as string) ?? ''} onChange={(e) => set(f.key, e.target.value)} />;
      case 'date':
        return <TextField key={f.key} {...common} type="date" InputLabelProps={{ shrink: true }} value={String(raw ?? '').slice(0, 10)} onChange={(e) => set(f.key, e.target.value)} />;
      case 'datetime':
        return <TextField key={f.key} {...common} type="datetime-local" InputLabelProps={{ shrink: true }} value={String(raw ?? '').slice(0, 16)} onChange={(e) => set(f.key, e.target.value)} />;
      case 'text':
      case 'json':
        return <TextField key={f.key} {...common} multiline minRows={f.type === 'json' ? 4 : 2} value={(raw as string) ?? ''} onChange={(e) => set(f.key, e.target.value)} helperText={f.type === 'json' ? 'JSON object or array' : undefined} />;
      case 'reference':
        return <TextField key={f.key} {...common} value={(raw as string) ?? ''} onChange={(e) => set(f.key, e.target.value)} helperText={`Record id of ${f.refEntity ?? 'referenced entity'}`} />;
      case 'file': {
        // Stored as { fileId, name?, … }; accept a FileVault file id here.
        const fileId = typeof raw === 'object' && raw !== null ? String((raw as { fileId?: string }).fileId ?? '') : String(raw ?? '');
        return <TextField key={f.key} {...common} value={fileId} onChange={(e) => set(f.key, e.target.value || undefined)} helperText="FileVault file id (copy it from Files)" />;
      }
      default:
        return <TextField key={f.key} {...common} value={(raw as string) ?? ''} onChange={(e) => set(f.key, e.target.value)} />;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? 'Edit' : 'New'} {entity.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {entity.fields.map(renderField)}
          {formError && <Alert severity="error">{formError}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending}>
          {isEdit ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
