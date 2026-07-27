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
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import HistoryIcon from '@mui/icons-material/History';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { IconButton, Tooltip } from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  lowcodeApi,
  type LcApp, type Entity, type Lookup, type Form, type Flow, type LookupValue,
} from '@/api/lowcode';
import { toMessage } from '@/lib/errors';
import { useToast } from '@/features/admin/ui';
import { useCatalog } from '@/features/lowcode/catalog';
import { RecordsPanel } from '@/features/lowcode/RecordsPanel';
import { EntityEditor } from '@/features/lowcode/EntityEditor';
import { LookupEditorDialog } from '@/features/lowcode/LookupEditorDialog';
import { LowcodeFlowEditor } from '@/features/lowcode/flow/LowcodeFlowEditor';
import { FlowRunsDialog } from '@/features/lowcode/flow/FlowRunsDialog';
import { ConfirmDangerDialog } from '@/features/lowcode/ConfirmDangerDialog';
import { FormEditorDialog } from '@/features/lowcode/FormEditorDialog';
import { AiGenerateDialog } from '@/features/lowcode/AiGenerateDialog';
import { AdvancedDataTable, type AdvColumn } from '@/features/lowcode/AdvancedDataTable';

type TabKey = 'data' | 'entities' | 'forms' | 'lookups' | 'flows';

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
        {canEdit && <Tab value="forms" label="Forms" />}
        {canEdit && <Tab value="lookups" label="Lookups" />}
        {canEdit && <Tab value="flows" label="Flows" />}
      </Tabs>

      {tab === 'data' && <DataTab app={app} entities={entities} canEdit={canEdit} />}
      {tab === 'entities' && canEdit && (
        <EntitiesTab app={app} entities={entities} showToast={showToast} showError={showError} />
      )}
      {tab === 'forms' && canEdit && (
        <FormsTab app={app} entities={entities} showToast={showToast} showError={showError} />
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
  const { catalog } = useCatalog();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Entity | null>(null);
  const [draft, setDraft] = useState<Partial<Entity> | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
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

  const openNew = () => { setEditing(null); setDraft(null); setEditorOpen(true); };
  const openEdit = (e: Entity) => { setEditing(e); setDraft(null); setEditorOpen(true); };

  const columns = useMemo<AdvColumn<Entity>[]>(() => [
    { key: 'name', header: 'Name', sortable: true, filter: { type: 'text' } },
    { key: 'key', header: 'Key', mono: true, sortable: true, filter: { type: 'text' } },
    { key: 'fields', header: 'Fields', align: 'right', render: (e) => (e.fields?.length ?? 0) },
    { key: 'stateMachine', header: 'State machine', render: (e) => (e.stateMachine ? 'Yes' : '—') },
    {
      key: '__actions', header: '', align: 'right',
      render: (e) => (
        <Tooltip title="Delete">
          <IconButton aria-label="Delete" size="small" color="error" onClick={(ev) => { ev.stopPropagation(); setToDelete(e); }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ], []);

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <span style={{ flex: 1 }} />
        {catalog.aiAssist && (
          <Button size="small" variant="outlined" startIcon={<AutoAwesomeIcon />} onClick={() => setAiOpen(true)}>Generate with AI</Button>
        )}
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
            draft={draft}
            appId={app.id}
            entities={entities}
            lookups={lookupsQ.data?.lookups ?? []}
            busy={save.isPending}
            onCancel={() => setEditorOpen(false)}
            onSave={(payload) => save.mutate(payload)}
          />
        </DialogContent>
      </Dialog>

      <AiGenerateDialog
        open={aiOpen}
        kind="entity"
        appId={app.id}
        onClose={() => setAiOpen(false)}
        onDraft={(d) => { setEditing(null); setDraft(d as Partial<Entity>); setEditorOpen(true); }}
      />

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

// ── Forms tab ─────────────────────────────────────────────────────────────────
function FormsTab({ app, entities, showToast, showError }: { app: LcApp; entities: Entity[] } & Toaster) {
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Form | null>(null);
  const [toDelete, setToDelete] = useState<Form | null>(null);

  const formsQ = useQuery({ queryKey: ['lowcode', 'forms', app.id], queryFn: () => lowcodeApi.forms(app.id) });
  const forms = formsQ.data?.forms ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ['lowcode', 'forms', app.id] });

  const save = useMutation({
    mutationFn: (payload: Partial<Form>) =>
      editing ? lowcodeApi.updateForm(editing.id, payload) : lowcodeApi.createForm(payload),
    onSuccess: () => {
      showToast(editing ? 'Form updated' : 'Form created', 'success');
      setEditorOpen(false);
      invalidate();
    },
    onError: showError,
  });
  const del = useMutation({
    mutationFn: (id: string) => lowcodeApi.deleteForm(id),
    onSuccess: () => { showToast('Form deleted', 'success'); setToDelete(null); invalidate(); },
    onError: showError,
  });

  const fieldCount = (f: Form) => (f.layout?.sections ?? []).reduce((n, s) => n + (s.fields?.length ?? 0), 0);

  const columns = useMemo<AdvColumn<Form>[]>(() => [
    { key: 'name', header: 'Name', sortable: true, filter: { type: 'text' } },
    { key: 'entityKey', header: 'Entity', mono: true, sortable: true, filter: { type: 'text' } },
    { key: '__fields', header: 'Fields', align: 'right', render: fieldCount },
    {
      key: 'isPublic', header: 'Public', align: 'center',
      render: (f) => (f.isPublic && f.slug ? (
        <Tooltip title="Copy public link">
          <Chip
            size="small" color="success" variant="outlined" label="public"
            icon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
            onClick={(ev) => { ev.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/f/${f.slug}`); }}
          />
        </Tooltip>
      ) : '—'),
    },
    {
      key: '__actions', header: '', align: 'right',
      render: (f) => (
        <Tooltip title="Delete">
          <IconButton aria-label="Delete" size="small" color="error" onClick={(ev) => { ev.stopPropagation(); setToDelete(f); }}>
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
        <Button size="small" variant="contained" startIcon={<AddIcon />} disabled={!entities.length} onClick={() => { setEditing(null); setEditorOpen(true); }}>
          New form
        </Button>
      </Stack>

      {!entities.length && <Alert severity="info">Add an entity first — forms render an entity's fields.</Alert>}
      {formsQ.isError && <Alert severity="error">{toMessage(formsQ.error)}</Alert>}

      <AdvancedDataTable<Form>
        columns={columns}
        rows={forms}
        rowKey={(f, i) => String(f.id ?? i)}
        empty="No forms yet. A form is a curated layout over an entity — sections, wizard steps, conditional fields, optional public link."
        onRowClick={(f) => { setEditing(f); setEditorOpen(true); }}
      />

      <FormEditorDialog
        open={editorOpen}
        form={editing}
        entities={entities}
        appId={app.id}
        busy={save.isPending}
        onClose={() => setEditorOpen(false)}
        onSave={(payload) => save.mutate(payload)}
      />

      <ConfirmDangerDialog
        open={!!toDelete}
        title={toDelete ? `Delete ${toDelete.name}` : ''}
        description={`This permanently deletes the form "${toDelete?.name}"${toDelete?.isPublic ? ' and its public link' : ''}.`}
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
          <IconButton aria-label="Delete" size="small" color="error" onClick={(ev) => { ev.stopPropagation(); setToDelete(l); }}>
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
  const { catalog } = useCatalog();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Flow | null>(null);
  const [draft, setDraft] = useState<Partial<Flow> | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [runsFor, setRunsFor] = useState<Flow | null>(null);
  const [toDelete, setToDelete] = useState<Flow | null>(null);

  const flowsQ = useQuery({ queryKey: ['lowcode', 'flows', app.id], queryFn: () => lowcodeApi.flows(app.id) });
  const flows = flowsQ.data?.flows ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ['lowcode', 'flows', app.id] });

  const execute = useMutation({
    mutationFn: (id: string) => lowcodeApi.executeFlow(id, {}),
    onSuccess: (r, id) => {
      showToast(`Run ${r.run?.status ?? 'finished'}`, r.run?.status === 'success' ? 'success' : 'warning');
      setRunsFor(flows.find((f) => f.id === id) ?? null);
    },
    onError: showError,
  });

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

  const openNew = () => { setEditing(null); setDraft(null); setEditorOpen(true); };
  const openEdit = (f: Flow) => { setEditing(f); setDraft(null); setEditorOpen(true); };

  const triggerLabel = (f: Flow) => {
    const t = f.trigger?.type;
    if (!t || t === 'event') return f.event;
    if (t === 'schedule') return `cron: ${f.trigger?.cron ?? ''}`;
    return t;
  };

  const columns = useMemo<AdvColumn<Flow>[]>(() => [
    { key: 'name', header: 'Name', sortable: true, filter: { type: 'text' } },
    { key: 'key', header: 'Key', mono: true, sortable: true, filter: { type: 'text' } },
    { key: 'event', header: 'Trigger', sortable: true, filter: { type: 'text' }, render: triggerLabel },
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
        <Stack direction="row" justifyContent="flex-end">
          <Tooltip title="Run now">
            <IconButton aria-label="Run now" size="small" disabled={execute.isPending} onClick={(ev) => { ev.stopPropagation(); execute.mutate(f.id); }}>
              <PlayArrowIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Run history">
            <IconButton aria-label="Run history" size="small" onClick={(ev) => { ev.stopPropagation(); setRunsFor(f); }}>
              <HistoryIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton aria-label="Delete" size="small" color="error" onClick={(ev) => { ev.stopPropagation(); setToDelete(f); }}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ], [toggle, execute]);

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <span style={{ flex: 1 }} />
        {catalog.aiAssist && (
          <Button size="small" variant="outlined" startIcon={<AutoAwesomeIcon />} onClick={() => setAiOpen(true)}>Generate with AI</Button>
        )}
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
            draft={draft}
            appId={app.id}
            appKey={app.key}
            entities={entities}
            busy={save.isPending}
            onCancel={() => setEditorOpen(false)}
            onSave={(payload) => save.mutate(payload)}
          />
        </DialogContent>
      </Dialog>

      <AiGenerateDialog
        open={aiOpen}
        kind="flow"
        appId={app.id}
        onClose={() => setAiOpen(false)}
        onDraft={(d) => { setEditing(null); setDraft(d as Partial<Flow>); setEditorOpen(true); }}
      />

      <FlowRunsDialog open={!!runsFor} flow={runsFor} onClose={() => setRunsFor(null)} />

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
