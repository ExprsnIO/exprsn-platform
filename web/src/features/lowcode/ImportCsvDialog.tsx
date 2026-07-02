/**
 * CSV import dialog for entity records. Structured flow: pick/paste CSV →
 * preview the header mapping → import → per-row error report. The backend
 * validates each row like a single create (types, uniqueness, references)
 * and skips invalid rows, so a partial import is normal and reported.
 */
import { useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useMutation } from '@tanstack/react-query';
import { lowcodeApi, type Entity } from '@/api/lowcode';
import { toMessage } from '@/lib/errors';

interface Props {
  open: boolean;
  entity: Entity;
  appKey: string;
  onClose: () => void;
  onImported: (created: number) => void;
}

export function ImportCsvDialog({ open, entity, appKey, onClose, onImported }: Props) {
  const [csv, setCsv] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const importM = useMutation({
    mutationFn: () => lowcodeApi.importRecords(entity.key, appKey, { csv }),
    onSuccess: (r) => { if (r.created) onImported(r.created); },
  });

  const headerPreview = useMemo(() => {
    const firstLine = csv.split(/\r?\n/).find((l) => l.trim());
    if (!firstLine) return [];
    const known = new Set([
      ...entity.fields.map((f) => f.key),
      ...entity.fields.map((f) => (f.label || '').toLowerCase()),
    ]);
    return firstLine.split(',').map((h) => {
      const name = h.replace(/^"|"$/g, '').trim();
      return { name, known: known.has(name) || known.has(name.toLowerCase()) };
    });
  }, [csv, entity.fields]);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setCsv(await file.text());
    importM.reset();
  };

  const result = importM.data;

  return (
    <Dialog open={open} onClose={importM.isPending ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Import {entity.name} records from CSV</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button size="small" variant="outlined" startIcon={<UploadFileIcon />} onClick={() => fileRef.current?.click()}>
              Choose CSV file
            </Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
            <Typography variant="caption" color="text.secondary">
              Header row uses field keys or labels. Up to 2000 rows per import.
            </Typography>
          </Stack>

          <TextField
            label="CSV" multiline minRows={8} maxRows={16} value={csv}
            onChange={(e) => { setCsv(e.target.value); importM.reset(); }}
            placeholder={`${entity.fields.map((f) => f.key).join(',')}\n…`}
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
          />

          {headerPreview.length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
              <Typography variant="caption" color="text.secondary">Columns:</Typography>
              {headerPreview.map((h, i) => (
                <Chip key={i} size="small" label={h.name} color={h.known ? 'success' : 'default'} variant={h.known ? 'filled' : 'outlined'} />
              ))}
              <Typography variant="caption" color="text.secondary">(grey columns are ignored)</Typography>
            </Stack>
          )}

          {importM.isError && <Alert severity="error">{toMessage(importM.error)}</Alert>}
          {result && (
            <Alert severity={result.failed ? (result.created ? 'warning' : 'error') : 'success'}>
              {result.created} row(s) imported{result.failed ? `, ${result.failed} failed` : ''}.
            </Alert>
          )}
          {result && result.errors.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow><TableCell width={70}>Row</TableCell><TableCell>Problems</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {result.errors.slice(0, 25).map((e) => (
                  <TableRow key={e.row}>
                    <TableCell>{e.row}</TableCell>
                    <TableCell>{e.errors.join('; ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose} disabled={importM.isPending}>{result?.created ? 'Done' : 'Cancel'}</Button>
        <Button variant="contained" onClick={() => importM.mutate()} disabled={!csv.trim() || importM.isPending}>
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
}
