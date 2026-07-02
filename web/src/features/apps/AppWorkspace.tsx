/**
 * App workspace — the studio for one low-code app. Builders get a tabbed surface:
 *  · Data     — pick an entity and manage its runtime records (RecordsPanel).
 *  · Entities — create/edit/delete the app's entity definitions (canEdit only).
 *  · Lookups  — manage reusable lookup lists (canEdit only).
 *  · Flows    — manage event-driven automations (canEdit only).
 * Reused by the standalone studio (/apps) and the Nexus group Apps tab. Read-only
 * viewers (canEdit=false) only see the Data tab.
 */
import { useMemo, useState } from 'react';
import {
  Stack, Box, TextField, MenuItem, Button, Chip, Switch, Dialog, DialogTitle,
  DialogContent, CircularProgress, Alert, Tabs, Tab,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { IconButton, Tooltip } from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  lowcodeApi,
  type LcApp, type Entity, type Lookup, type Flow, type LookupValue,
} from '@/api/lowcode';
import { toMessage } from '@/lib/errors';
import { useToast } from '@/features/admin/ui';
import { RecordsPanel } from '@/features/lowcode/RecordsPanel';
import { EntityEditor } from '@/features/lowcode/EntityEditor';
import { LookupEditorDialog } from '@/features/lowcode/LookupEditorDialog';
import { LowcodeFlowEditor } from '@/features/lowcode/flow/LowcodeFlowEditor';
import { ConfirmDangerDialog } from '@/features/lowcode/ConfirmDangerDialog';
import { AdvancedDataTable, type AdvColumn } from '@/features/lowcode/AdvancedDataTable';

type TabKey = 'data' | 'entities' | 'lookups' | 'flows';

export default function AppWorkspace({ app, canEdit }: { app: LcApp; canEdit: boolean }) {
  const [tab, setTab] = useState<TabKey>('data');
  const { showToast, showError, ToastHost } = useToast();

  const entitiesQ = useQuery({
    queryKey: ['lowcode', 'entities', app.id],
    queryFn: () => lowcodeApi.entities(app.id),
  });
  const entities = useMemo(() => entitiesQ.data?.entities ?? [], [entitiesQ.data]);

  if (entitiesQ.isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (entitiesQ.isError) return <Alert severity="error">{toMessage(entitiesQ.error)}</Alert>;

  return (
    <Stack spacing={2}>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile>
        <Tab value="data" label="Data" />
        {canEdit && <Tab value="entities" label="Entities" />}
        {canEdit && <Tab value="lookups" label="Lookups" />}
        {canEdit && <Tab value="flows" label="Flows" />}
      </Tabs>

      {tab === 'data' && <DataTab app={app} entities={entities} canEdit={canEdit} />}
      {tab === 'entities' && canEdit && (
        <EntitiesTab app={app} entities={entities} showToast={showToast} showError={showError} />
      )}
      {tab === 'lookups' && canEdit && (
        <LookupsTab app={app} showToast={showToast} showError={showError} />
      )}
      {tab === 'flows' && canEdit && (
        <FlowsTab app={app} entities={entities} showToast={showToast} showError={showError} />
      )}

      {ToastHost}
    </Stack>
  );
}

type Toaster = {
  showToast: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
  showError: (e: unknown) => void;
};

// ── Data tab ────────────────────────────────────────────────────────────────
function DataTab({ app, entities, canEdit }: { app: LcApp; entities: Entity[]; canEdit: boolean }) {
  const [entityKey, setEntityKey] = useState<string>('');
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

  if (!entities.length) {
    return <Alert severity="info">This app has no entities yet. Add one in the Entities tab, then manage its data here.</Alert>;
  }

  return (
    <Stack spacing={2}>
      <TextField
        select size="small" label="Entity" sx={{ minWidth: 220, alignSelf: 'flex-start' }}
        value={entity?.key ?? ''} onChange={(e) => setEntityKey(e.target.value)}
      >
        {entities.map((e) => <MenuItem key={e.key} value={e.key}>{e.name}</MenuItem>)}
      </TextField>

      {entity && (
        <RecordsPanel
          entity={entity}
          appKey={app.key}
          lookupOptions={lookupsQ.data ?? {}}
          canEdit={canEdit}
        />
      )}
    </Stack>
  );
}

// ── Entities tab ──────────────────────────────────────────────────────────────
function EntitiesTab({ app, entities, showToast, showError }: { app: LcApp; entities: Entity[] } & Toaster) {
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Entity | null>(null);
  const [toDelete, setToDelete] = useState<Entity | null>(null);

  const lookupsQ = useQuery({ queryKey: ['lowcode', 'lookups', app.id], queryFn: () => lowcodeApi.lookups(app.id) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['lowcode', 'entities', app.id] });

  const save = useMutation({
    mutationFn: (payload: Partial<Entity>) =>
      editing ? lowcodeApi.updateEntity(editing.id, payload) : lowcodeApi.createEntity(payload),
    onSuccess: () => {
      showToast(editing ? 'Entity updated' : 'Entity created', 'success');
      setEditorOpen(false);
      invalidate();
    },
    onError: showError,
  });
  const del = useMutation({
    mutationFn: (id: string) => lowcodeApi.deleteEntity(id),
    onSuccess: () => { showToast('Entity deleted', 'success'); setToDelete(null); invalidate(); },
    onError: showError,
  });

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (e: Entity) => { setEditing(e); setEditorOpen(true); };

  const columns = useMemo<AdvColumn<Entity>[]>(() => [
    { key: 'name', header: 'Name', sortable: true, filter: { type: 'text' } },
    { key: 'key', header: 'Key', mono: true, sortable: true, filter: { type: 'text' } },
    { key: 'fields', header: 'Fields', align: 'right', render: (e) => (e.fields?.length ?? 0) },
    { key: 'stateMachine', header: 'State machine', render: (e) => (e.stateMachine ? 'Yes' : '—') },
    {
      key: '__actions', header: '', align: 'right',
      render: (e) => (
        <Tooltip title="Delete">
          <IconButton size="small" color="error" onClick={(ev) => { ev.stopPropagation(); setToDelete(e); }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ], []);

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" alignItems="center">
        <span style={{ flex: 1 }} />
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openNew}>New entity</Button>
      </Stack>

      <AdvancedDataTable<Entity>
        columns={columns}
        rows={entities}
        rowKey={(e, i) => String(e.id ?? i)}
        empty="No entities yet."
        onRowClick={openEdit}
      />

      <Dialog open={editorOpen} onClose={save.isPending ? undefined : () => setEditorOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editing ? `Edit entity — ${editing.name}` : 'New entity'}</DialogTitle>
        <DialogContent dividers>
          <EntityEditor
            entity={editing}
            appId={app.id}
            entities={entities}
            lookups={lookupsQ.data?.lookups ?? []}
            busy={save.isPending}
            onCancel={() => setEditorOpen(false)}
            onSave={(payload) => save.mutate(payload)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDangerDialog
        open={!!toDelete}
        title={toDelete ? `Delete ${toDelete.name}` : ''}
        description={`This permanently deletes the entity "${toDelete?.name}" and all of its records.`}
        confirmPhrase={toDelete?.key ?? ''}
        busy={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
      />
    </Stack>
  );
}

// ── Lookups tab ───────────────────────────────────────────────────────────────
function LookupsTab({ app, showToast, showError }: { app: LcApp } & Toaster) {
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Lookup | null>(null);
  const [toDelete, setToDelete] = useState<Lookup | null>(null);

  const lookupsQ = useQuery({ queryKey: ['lowcode', 'lookups', app.id], queryFn: () => lowcodeApi.lookups(app.id) });
  const lookups = lookupsQ.data?.lookups ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ['lowcode', 'lookups', app.id] });

  const save = useMutation({
    mutationFn: (payload: Partial<Lookup>) =>
      editing ? lowcodeApi.updateLookup(editing.id, payload) : lowcodeApi.createLookup(payload),
    onSuccess: () => {
      showToast(editing ? 'Lookup updated' : 'Lookup created', 'success');
      setEditorOpen(false);
      invalidate();
    },
    onError: showError,
  });
  const del = useMutation({
    mutationFn: (id: string) => lowcodeApi.deleteLookup(id),
    onSuccess: () => { showToast('Lookup deleted', 'success'); setToDelete(null); invalidate(); },
    onError: showError,
  });

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (l: Lookup) => { setEditing(l); setEditorOpen(true); };

  const columns = useMemo<AdvColumn<Lookup>[]>(() => [
    { key: 'name', header: 'Name', sortable: true, filter: { type: 'text' } },
    { key: 'key', header: 'Key', mono: true, sortable: true, filter: { type: 'text' } },
    {
      key: 'source', header: 'Source',
      render: (l) => (
        <Chip
          size="small" variant="outlined"
          label={l.source?.type === 'provider' ? `provider:${l.source.provider}` : 'static'}
        />
      ),
    },
    { key: 'values', header: 'Values', align: 'right', render: (l) => (l.values?.length ?? 0) },
    {
      key: '__actions', header: '', align: 'right',
      render: (l) => (
        <Tooltip title="Delete">
          <IconButton size="small" color="error" onClick={(ev) => { ev.stopPropagation(); setToDelete(l); }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ], []);

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" alignItems="center">
        <span style={{ flex: 1 }} />
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openNew}>New lookup</Button>
      </Stack>

      {lookupsQ.isError && <Alert severity="error">{toMessage(lookupsQ.error)}</Alert>}

      <AdvancedDataTable<Lookup>
        columns={columns}
        rows={lookups}
        rowKey={(l, i) => String(l.id ?? i)}
        empty="No lookups yet."
        onRowClick={openEdit}
      />

      <LookupEditorDialog
        open={editorOpen}
        lookup={editing}
        appId={app.id}
        busy={save.isPending}
        onClose={() => setEditorOpen(false)}
        onSave={(payload) => save.mutate(payload)}
      />

      <ConfirmDangerDialog
        open={!!toDelete}
        title={toDelete ? `Delete ${toDelete.name}` : ''}
        description={`This permanently deletes the lookup "${toDelete?.name}".`}
        confirmPhrase={toDelete?.key ?? ''}
        busy={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
      />
    </Stack>
  );
}

// ── Flows tab ─────────────────────────────────────────────────────────────────
function FlowsTab({ app, entities, showToast, showError }: { app: LcApp; entities: Entity[] } & Toaster) {
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Flow | null>(null);
  const [toDelete, setToDelete] = useState<Flow | null>(null);

  const flowsQ = useQuery({ queryKey: ['lowcode', 'flows', app.id], queryFn: () => lowcodeApi.flows(app.id) });
  const flows = flowsQ.data?.flows ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ['lowcode', 'flows', app.id] });

  const save = useMutation({
    mutationFn: (payload: Partial<Flow>) =>
      editing ? lowcodeApi.updateFlow(editing.id, payload) : lowcodeApi.createFlow(payload),
    onSuccess: () => {
      showToast(editing ? 'Flow updated' : 'Flow created', 'success');
      setEditorOpen(false);
      invalidate();
    },
    onError: showError,
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => lowcodeApi.updateFlow(id, { enabled }),
    onSuccess: () => invalidate(),
    onError: showError,
  });
  const del = useMutation({
    mutationFn: (id: string) => lowcodeApi.deleteFlow(id),
    onSuccess: () => { showToast('Flow deleted', 'success'); setToDelete(null); invalidate(); },
    onError: showError,
  });

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (f: Flow) => { setEditing(f); setEditorOpen(true); };

  const columns = useMemo<AdvColumn<Flow>[]>(() => [
    { key: 'name', header: 'Name', sortable: true, filter: { type: 'text' } },
    { key: 'key', header: 'Key', mono: true, sortable: true, filter: { type: 'text' } },
    { key: 'event', header: 'Event', sortable: true, filter: { type: 'text' } },
    { key: 'scopeType', header: 'Scope', render: (f) => <Chip size="small" variant="outlined" label={f.scopeType} /> },
    {
      key: 'enabled', header: 'Enabled', align: 'center',
      render: (f) => (
        <Switch
          size="small"
          checked={!!f.enabled}
          disabled={toggle.isPending}
          onClick={(ev) => { ev.stopPropagation(); toggle.mutate({ id: f.id, enabled: !f.enabled }); }}
        />
      ),
    },
    {
      key: '__actions', header: '', align: 'right',
      render: (f) => (
        <Tooltip title="Delete">
          <IconButton size="small" color="error" onClick={(ev) => { ev.stopPropagation(); setToDelete(f); }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ], [toggle]);

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" alignItems="center">
        <span style={{ flex: 1 }} />
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openNew}>New flow</Button>
      </Stack>

      {flowsQ.isError && <Alert severity="error">{toMessage(flowsQ.error)}</Alert>}

      <AdvancedDataTable<Flow>
        columns={columns}
        rows={flows}
        rowKey={(f, i) => String(f.id ?? i)}
        empty="No flows yet."
        onRowClick={openEdit}
      />

      <Dialog open={editorOpen} onClose={save.isPending ? undefined : () => setEditorOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>{editing ? `Edit flow — ${editing.name}` : 'New flow'}</DialogTitle>
        <DialogContent dividers>
          <LowcodeFlowEditor
            flow={editing}
            appId={app.id}
            entities={entities}
            busy={save.isPending}
            onCancel={() => setEditorOpen(false)}
            onSave={(payload) => save.mutate(payload)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDangerDialog
        open={!!toDelete}
        title={toDelete ? `Delete ${toDelete.name}` : ''}
        description={`This permanently deletes the flow "${toDelete?.name}".`}
        confirmPhrase={toDelete?.key ?? ''}
        busy={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
      />
    </Stack>
  );
}
