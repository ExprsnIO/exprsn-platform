/**
 * RecordsPanel — browse and manage an entity's runtime records with server-side
 * filtering/sorting/pagination, free-text search, CSV import/export, saved views
 * and a kanban board, plus create/edit/delete and a guarded "truncate". Reused
 * by the admin entity detail page and the /apps studio, so it takes the scoped
 * appKey and drives lowcodeApi.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  IconButton, InputAdornment, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import SearchIcon from '@mui/icons-material/Search';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined';
import { lowcodeApi, type Entity, type Field, type LcRecord, type LcView, type LookupValue } from '@/api/lowcode';
import { JsonDialog, useToast } from '@/features/admin/ui';
import { AdvancedDataTable, emptyQuery, queryFilters, type AdvColumn, type ColumnFilterType, type TableQuery } from './AdvancedDataTable';
import { ConfirmDangerDialog } from './ConfirmDangerDialog';
import { ImportCsvDialog } from './ImportCsvDialog';
import { KanbanBoard, kanbanGroupFields } from './KanbanBoard';
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
  if (f.type === 'file') return (v as { name?: string; fileId?: string }).name ?? String((v as { fileId?: string }).fileId ?? '').slice(0, 8);
  if (f.type === 'json' || typeof v === 'object') return JSON.stringify(v).slice(0, 60);
  return String(v);
}

type ViewMode = 'grid' | 'kanban';

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
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<ViewMode>('grid');
  const [kanbanField, setKanbanField] = useState<string>('');
  const [activeViewId, setActiveViewId] = useState<string>('');
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [view, setView] = useState<LcRecord | null>(null);
  const [editing, setEditing] = useState<LcRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [truncateOpen, setTruncateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const groupFields = useMemo(() => kanbanGroupFields(entity), [entity]);
  const kanbanKey = kanbanField || groupFields[0]?.key || '';

  const recordsQ = useQuery({
    queryKey: ['lowcode', 'records', entity.appId, entity.key, query, q],
    queryFn: () => lowcodeApi.records(entity.key, appKey, {
      limit: query.limit, offset: query.offset,
      sort: query.sort, filters: queryFilters(query), q: q || undefined,
    }),
    placeholderData: keepPreviousData,
    enabled: mode === 'grid',
  });

  const viewsQ = useQuery({
    queryKey: ['lowcode', 'views', entity.appId, entity.key],
    queryFn: () => lowcodeApi.views(entity.key, appKey),
  });
  const views = viewsQ.data?.views ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['lowcode', 'records', entity.appId, entity.key] });
  const invalidateViews = () => qc.invalidateQueries({ queryKey: ['lowcode', 'views', entity.appId, entity.key] });

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
  const deleteView = useMutation({
    mutationFn: (id: string) => lowcodeApi.deleteView(entity.key, appKey, id),
    onSuccess: () => { setActiveViewId(''); invalidateViews(); },
    onError: showError,
  });

  const exportCsv = useMutation({
    mutationFn: () => lowcodeApi.exportRecordsCsv(entity.key, appKey, {
      sort: query.sort, filters: queryFilters(query), q: q || undefined,
    }),
    onSuccess: (csv) => {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = `${entity.key}.csv`; a.click();
      URL.revokeObjectURL(url);
    },
    onError: showError,
  });

  const applyView = (v: LcView | undefined) => {
    setActiveViewId(v?.id ?? '');
    if (!v) { setQuery(emptyQuery(query.limit)); setQ(''); setMode('grid'); return; }
    const cfg = v.config ?? {};
    const tq = cfg.tableQuery as TableQuery | undefined;
    setQuery(tq ? { ...tq, offset: 0 } : emptyQuery(query.limit));
    setQ((cfg.q as string) ?? '');
    if (v.viewType === 'kanban') { setMode('kanban'); if (cfg.groupByField) setKanbanField(cfg.groupByField); }
    else setMode('grid');
  };

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
  const activeView = views.find((v) => v.id === activeViewId);

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        {canEdit && <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setDialogOpen(true); }}>New {entity.name}</Button>}

        <TextField
          size="small" placeholder="Search…" value={q}
          onChange={(e) => { setQ(e.target.value); setQuery((prev) => ({ ...prev, offset: 0 })); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ width: 200 }}
        />

        {views.length > 0 && (
          <TextField select size="small" label="View" value={activeViewId} sx={{ minWidth: 150 }}
            onChange={(e) => applyView(views.find((v) => v.id === e.target.value))}>
            <MenuItem value=""><em>default</em></MenuItem>
            {views.map((v) => <MenuItem key={v.id} value={v.id}>{v.name}{v.ownerId === null ? ' (shared)' : ''}</MenuItem>)}
          </TextField>
        )}
        <Tooltip title="Save current filters/search as a view">
          <IconButton size="small" onClick={() => setSaveViewOpen(true)}><BookmarkAddOutlinedIcon fontSize="small" /></IconButton>
        </Tooltip>
        {activeView && (
          <Tooltip title="Delete this view">
            <IconButton size="small" color="error" disabled={deleteView.isPending} onClick={() => deleteView.mutate(activeView.id)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        <span style={{ flex: 1 }} />

        {groupFields.length > 0 && (
          <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_e, m) => m && setMode(m)}>
            <ToggleButton value="grid"><Tooltip title="Grid"><TableRowsOutlinedIcon fontSize="small" /></Tooltip></ToggleButton>
            <ToggleButton value="kanban"><Tooltip title="Kanban"><ViewKanbanOutlinedIcon fontSize="small" /></Tooltip></ToggleButton>
          </ToggleButtonGroup>
        )}
        <Tooltip title="Export CSV (current filters)">
          <IconButton size="small" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate()}><FileDownloadOutlinedIcon fontSize="small" /></IconButton>
        </Tooltip>
        {canEdit && (
          <Tooltip title="Import CSV">
            <IconButton size="small" onClick={() => setImportOpen(true)}><FileUploadOutlinedIcon fontSize="small" /></IconButton>
          </Tooltip>
        )}
        {canEdit && (
          <Button size="small" color="error" variant="outlined" startIcon={<DeleteSweepOutlinedIcon />} onClick={() => setTruncateOpen(true)}>
            Truncate
          </Button>
        )}
      </Stack>

      {mode === 'kanban' && groupFields.length > 1 && (
        <TextField select size="small" label="Board by" value={kanbanKey} sx={{ width: 200, alignSelf: 'flex-start' }}
          onChange={(e) => setKanbanField(e.target.value)}>
          {groupFields.map((g) => <MenuItem key={g.key} value={g.key}>{g.label}</MenuItem>)}
        </TextField>
      )}

      {mode === 'grid' && recordsQ.isError && <Alert severity="error">Failed to load records.</Alert>}

      {mode === 'grid' ? (
        <AdvancedDataTable<LcRecord>
          columns={columns}
          rows={data?.records ?? []}
          rowKey={(r, i) => String(r.id ?? i)}
          empty="No records match."
          server={{ total: data?.total ?? 0, query, onQueryChange: setQuery }}
        />
      ) : (
        <KanbanBoard
          entity={entity} appKey={appKey} groupKey={kanbanKey} lookupOptions={lookupOptions}
          canEdit={canEdit} onOpen={(r) => { if (canEdit) { setEditing(r); setDialogOpen(true); } else setView(r); }}
        />
      )}

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

      <SaveViewDialog
        open={saveViewOpen}
        entity={entity}
        appKey={appKey}
        canShare={canEdit}
        build={() => ({
          viewType: mode,
          config: { tableQuery: { ...query, offset: 0 }, q: q || undefined, groupByField: mode === 'kanban' ? kanbanKey : undefined },
        })}
        onClose={() => setSaveViewOpen(false)}
        onSaved={(v) => { setSaveViewOpen(false); setActiveViewId(v.id); invalidateViews(); showToast('View saved', 'success'); }}
      />

      <ImportCsvDialog
        open={importOpen}
        entity={entity}
        appKey={appKey}
        onClose={() => setImportOpen(false)}
        onImported={(n) => { showToast(`${n} record(s) imported`, 'success'); invalidate(); }}
      />

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

/** Name + share toggle for saving the current grid/kanban configuration. */
function SaveViewDialog({ open, entity, appKey, canShare, build, onClose, onSaved }: {
  open: boolean;
  entity: Entity;
  appKey: string;
  canShare: boolean;
  build: () => { viewType: ViewMode; config: Record<string, unknown> };
  onClose: () => void;
  onSaved: (v: LcView) => void;
}) {
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const { viewType, config } = build();
      return lowcodeApi.createView(entity.key, appKey, { name: name.trim(), viewType, config, shared });
    },
    onSuccess: (r) => { setName(''); setShared(false); onSaved(r.view); },
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Save view</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField autoFocus label="Name" size="small" value={name} onChange={(e) => setName(e.target.value)} />
          {canShare && (
            <FormControlLabel
              control={<Checkbox checked={shared} onChange={(e) => setShared(e.target.checked)} />}
              label="Share with everyone who can see this app"
            />
          )}
          {save.isError && <Alert severity="error">Could not save the view.</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
