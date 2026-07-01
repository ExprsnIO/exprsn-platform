/**
 * App workspace — the runtime for one low-code app: pick an entity, browse its
 * records in an auto-generated grid (columns from the entity's fields), and
 * create/edit/delete via the auto-generated form. Reused by the standalone
 * studio (/apps) and the Nexus group Apps tab.
 */
import { useMemo, useState } from 'react';
import {
  Stack, Paper, Typography, Box, TextField, MenuItem, Button, IconButton,
  Table, TableHead, TableRow, TableCell, TableBody, CircularProgress, Alert, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { lowcodeApi, type LcApp, type Entity, type Field, type LcRecord, type LookupValue } from '@/api/lowcode';
import { toMessage } from '@/lib/errors';
import RecordFormDialog from './RecordFormDialog';

function cellValue(record: LcRecord, field: Field): string {
  const data = (record as { data?: Record<string, unknown> }).data ?? {};
  const v = data[field.key];
  if (v === null || v === undefined || v === '') return '—';
  if (field.type === 'boolean') return v ? 'Yes' : 'No';
  if (field.type === 'json') return JSON.stringify(v);
  return String(v);
}

export default function AppWorkspace({ app, canEdit }: { app: LcApp; canEdit: boolean }) {
  const qc = useQueryClient();
  const [entityKey, setEntityKey] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LcRecord | null>(null);

  const entitiesQ = useQuery({ queryKey: ['lowcode', 'entities', app.id], queryFn: () => lowcodeApi.entities(app.id) });
  const entities = useMemo(() => entitiesQ.data?.entities ?? [], [entitiesQ.data]);
  const entity: Entity | undefined = useMemo(
    () => entities.find((e) => e.key === entityKey) ?? entities[0],
    [entities, entityKey],
  );

  const lookupsQ = useQuery({
    queryKey: ['lowcode', 'lookup-options', app.id],
    queryFn: async (): Promise<Record<string, LookupValue[]>> => {
      const { lookups } = await lowcodeApi.lookups(app.id);
      const entries = await Promise.all(
        lookups.map(async (l) => [l.key, (await lowcodeApi.resolvedLookup(l.id)).values] as const),
      );
      return Object.fromEntries(entries);
    },
  });

  const recordsQ = useQuery({
    queryKey: ['lowcode', 'records', app.id, entity?.key],
    queryFn: () => lowcodeApi.records(entity!.key, app.key),
    enabled: !!entity,
  });

  const del = useMutation({
    mutationFn: (id: string) => lowcodeApi.deleteRecord(entity!.key, app.key, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lowcode', 'records', app.id, entity?.key] }),
  });

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (r: LcRecord) => { setEditing(r); setDialogOpen(true); };
  const onSaved = () => { setDialogOpen(false); qc.invalidateQueries({ queryKey: ['lowcode', 'records', app.id, entity?.key] }); };

  if (entitiesQ.isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (entitiesQ.isError) return <Alert severity="error">{toMessage(entitiesQ.error)}</Alert>;
  if (!entities.length) return <Alert severity="info">This app has no entities yet. Create entities in the Admin → Lowcode console, then manage their data here.</Alert>;

  const records = recordsQ.data?.records ?? [];

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} alignItems="center">
        <TextField
          select size="small" label="Entity" sx={{ minWidth: 220 }}
          value={entity?.key ?? ''} onChange={(e) => setEntityKey(e.target.value)}
        >
          {entities.map((e) => <MenuItem key={e.key} value={e.key}>{e.name}</MenuItem>)}
        </TextField>
        <Box sx={{ flex: 1 }} />
        {canEdit && entity && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>New {entity.name}</Button>
        )}
      </Stack>

      <Paper variant="outlined">
        {recordsQ.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
        ) : recordsQ.isError ? (
          <Alert severity="error" sx={{ m: 2 }}>{toMessage(recordsQ.error)}</Alert>
        ) : !records.length ? (
          <Typography color="text.secondary" sx={{ p: 3 }}>No records yet.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                {entity!.fields.map((f) => <TableCell key={f.key}>{f.label}</TableCell>)}
                {canEdit && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id} hover>
                  {entity!.fields.map((f) => <TableCell key={f.key}>{cellValue(r, f)}</TableCell>)}
                  {canEdit && (
                    <TableCell align="right">
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(r)}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" onClick={() => del.mutate(r.id)} disabled={del.isPending}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {entity && (
        <RecordFormDialog
          open={dialogOpen}
          entity={entity}
          appKey={app.key}
          record={editing}
          lookupOptions={lookupsQ.data ?? {}}
          onClose={() => setDialogOpen(false)}
          onSaved={onSaved}
        />
      )}
    </Stack>
  );
}
