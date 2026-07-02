/**
 * RecordsPanel — browse and manage an entity's runtime records with server-side
 * filtering/sorting/pagination (records can be large), plus create/edit/delete
 * and a guarded "truncate" (delete all). Reused by the admin entity detail page
 * and the /apps studio, so it takes the scoped appKey and drives lowcodeApi.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, IconButton, Stack, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import { lowcodeApi, type Entity, type Field, type LcRecord, type LookupValue } from '@/api/lowcode';
import { JsonDialog, useToast } from '@/features/admin/ui';
import { AdvancedDataTable, emptyQuery, queryFilters, type AdvColumn, type ColumnFilterType, type TableQuery } from './AdvancedDataTable';
import { ConfirmDangerDialog } from './ConfirmDangerDialog';
import RecordFormDialog from '@/features/apps/RecordFormDialog';

function filterType(f: Field): ColumnFilterType {
  if (f.type === 'number' || f.type === 'integer') return 'number';
  if (f.type === 'boolean') return 'boolean';
  if (f.type === 'date' || f.type === 'datetime') return 'date';
  if (f.type === 'enum') return 'enum';
  return 'text';
}

function cellValue(r: LcRecord, f: Field): string {
  const v = (r.data ?? {})[f.key];
  if (v === null || v === undefined || v === '') return '—';
  if (f.type === 'boolean') return v ? 'Yes' : 'No';
  if (f.type === 'json') return JSON.stringify(v).slice(0, 60);
  return String(v);
}

export function RecordsPanel({
  entity, appKey, lookupOptions = {}, canEdit = true,
}: {
  entity: Entity;
  appKey: string;
  lookupOptions?: Record<string, LookupValue[]>;
  canEdit?: boolean;
}) {
  const qc = useQueryClient();
  const { showToast, showError, ToastHost } = useToast();
  const [query, setQuery] = useState<TableQuery>(() => emptyQuery(25));
  const [view, setView] = useState<LcRecord | null>(null);
  const [editing, setEditing] = useState<LcRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [truncateOpen, setTruncateOpen] = useState(false);

  const recordsQ = useQuery({
    queryKey: ['lowcode', 'records', entity.appId, entity.key, query],
    queryFn: () => lowcodeApi.records(entity.key, appKey, {
      limit: query.limit, offset: query.offset,
      sort: query.sort, filters: queryFilters(query),
    }),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['lowcode', 'records', entity.appId, entity.key] });

  const del = useMutation({
    mutationFn: (id: string) => lowcodeApi.deleteRecord(entity.key, appKey, id),
    onSuccess: () => { showToast('Record deleted', 'success'); invalidate(); },
    onError: showError,
  });
  const truncate = useMutation({
    mutationFn: () => lowcodeApi.truncateEntity(entity.id),
    onSuccess: (r) => { showToast(`Truncated — ${r.removed} record(s) removed`, 'success'); setTruncateOpen(false); invalidate(); },
    onError: showError,
  });

  const columns = useMemo<AdvColumn<LcRecord>[]>(() => {
    const fieldCols: AdvColumn<LcRecord>[] = (entity.fields ?? []).map((f) => ({
      key: f.key,
      header: f.label || f.key,
      sortable: true,
      render: (r) => cellValue(r, f),
      filter: {
        type: filterType(f),
        field: f.key,
        options: f.type === 'enum'
          ? (f.enumValues?.map((v) => ({ value: v, label: v })) ?? (f.enumLookup ? lookupOptions[f.enumLookup] : undefined))
          : undefined,
      },
    }));
    const actionCol: AdvColumn<LcRecord> = {
      key: '__actions', header: '', align: 'right',
      render: (r) => (
        <Stack direction="row" justifyContent="flex-end">
          <Tooltip title="View"><IconButton size="small" onClick={() => setView(r)}><VisibilityOutlinedIcon fontSize="small" /></IconButton></Tooltip>
          {canEdit && <Tooltip title="Edit"><IconButton size="small" onClick={() => { setEditing(r); setDialogOpen(true); }}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
          {canEdit && <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => del.mutate(r.id)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>}
        </Stack>
      ),
    };
    return [...fieldCols, actionCol];
  }, [entity.fields, lookupOptions, canEdit, del]);

  const data = recordsQ.data;

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        {canEdit && <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setDialogOpen(true); }}>New {entity.name}</Button>}
        <span style={{ flex: 1 }} />
        {canEdit && (
          <Button size="small" color="error" variant="outlined" startIcon={<DeleteSweepOutlinedIcon />} onClick={() => setTruncateOpen(true)}>
            Truncate
          </Button>
        )}
      </Stack>

      {recordsQ.isError && <Alert severity="error">Failed to load records.</Alert>}

      <AdvancedDataTable<LcRecord>
        columns={columns}
        rows={data?.records ?? []}
        rowKey={(r, i) => String(r.id ?? i)}
        empty="No records match."
        server={{ total: data?.total ?? 0, query, onQueryChange: setQuery }}
      />

      <RecordFormDialog
        open={dialogOpen}
        entity={entity}
        appKey={appKey}
        record={editing}
        lookupOptions={lookupOptions}
        onClose={() => setDialogOpen(false)}
        onSaved={() => { setDialogOpen(false); showToast(editing ? 'Record updated' : 'Record created', 'success'); invalidate(); }}
      />

      <JsonDialog open={!!view} title={view ? `Record ${String(view.id).slice(0, 8)}` : ''} value={view} onClose={() => setView(null)} />

      <ConfirmDangerDialog
        open={truncateOpen}
        title={`Truncate ${entity.name}`}
        description={`This permanently deletes every record of "${entity.name}". The entity definition is kept.`}
        confirmPhrase={entity.key}
        confirmLabel="Truncate"
        busy={truncate.isPending}
        onCancel={() => setTruncateOpen(false)}
        onConfirm={() => truncate.mutate()}
      />
      {ToastHost}
    </Stack>
  );
}
