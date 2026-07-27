/**
 * Low-Code admin console. Manages apps, entities, lookups, flows and records with
 * advanced (filter/sort/paginate) tables and full lifecycle: create, edit,
 * delete, truncate. Heavy editors (entities, flows) open as dedicated detail
 * routes (/admin/lowcode/entities/:id, /flows/:id); lighter details (apps,
 * lookups, records) open in modals. Destructive actions are typed-confirm gated.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem,
  Stack, Switch, Tab, Tabs, TextField, Tooltip,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  lowcodeAdminApi, type LcApp, type Lookup, type Entity, type Flow, type ScopeType,
} from '@/api/admin/lowcode';
import { SectionHeader, StatusChip, useToast } from '../ui';
import { AdvancedDataTable, type AdvColumn } from '@/features/lowcode/AdvancedDataTable';
import { ConfirmDangerDialog } from '@/features/lowcode/ConfirmDangerDialog';
import { LookupEditorDialog } from '@/features/lowcode/LookupEditorDialog';
import { RecordsPanel } from '@/features/lowcode/RecordsPanel';

interface TabProps { onToast: (m: string) => void; onError: (e: unknown) => void }
const SCOPES: ScopeType[] = ['platform', 'organization', 'group', 'user'];

/* -------------------------------------------------------------------- apps */

function CreateAppDialog({ onToast, onError }: TabProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!key.trim() || !name.trim()) return;
    setBusy(true);
    try {
      await lowcodeAdminApi.createApp({ key: key.trim(), name: name.trim(), description: description.trim() || undefined });
      onToast('App created.');
      qc.invalidateQueries({ queryKey: ['lowcode', 'apps'] });
      setOpen(false); setKey(''); setName(''); setDescription('');
    } catch (e) { onError(e); } finally { setBusy(false); }
  };

  return (
    <>
      <Button variant="contained" onClick={() => setOpen(true)}>New app</Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New app</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Key" value={key} onChange={(e) => setKey(e.target.value)} fullWidth helperText="lower-snake/kebab" />
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
            <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={busy || !key.trim() || !name.trim()}>Create</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function AppDetailDialog({ app, onClose, onToast, onError }: TabProps & { app: LcApp | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('draft');
  const [seeded, setSeeded] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (app && seeded !== app.id) {
    setSeeded(app.id);
    setName(app.name); setDescription(app.description ?? ''); setStatus(String(app.status));
  }

  const save = useMutation({
    mutationFn: () => lowcodeAdminApi.updateApp(app!.id, { name, description: description || undefined, status }),
    onSuccess: () => { onToast('App updated.'); qc.invalidateQueries({ queryKey: ['lowcode', 'apps'] }); onClose(); },
    onError,
  });
  const del = useMutation({
    mutationFn: () => lowcodeAdminApi.deleteApp(app!.id),
    onSuccess: (r) => {
      const c = r.removed || {};
      onToast(`App deleted (${c.removedEntities ?? 0} entities, ${c.removedRecords ?? 0} records).`);
      qc.invalidateQueries({ queryKey: ['lowcode'] }); setDeleteOpen(false); onClose();
    },
    onError,
  });

  return (
    <>
      <Dialog open={!!app} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>{app ? `App · ${app.name}` : 'App'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Key" value={app?.key ?? ''} disabled fullWidth />
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
            <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />
            <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ maxWidth: 220 }}>
              {['draft', 'published', 'archived'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
            <Alert severity="warning">Deleting an app cascades to all its entities, records, lookups, forms and flows.</Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="error" onClick={() => setDeleteOpen(true)} sx={{ mr: 'auto' }}>Delete app</Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDangerDialog
        open={deleteOpen}
        title={`Delete ${app?.name ?? 'app'}`}
        description="This permanently deletes the app and everything in it."
        warning="All entities, records, lookups, forms and flows for this app are removed."
        confirmPhrase={app?.key ?? ''}
        confirmLabel="Delete app"
        busy={del.isPending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => del.mutate()}
      />
    </>
  );
}

function AppsTab({ onToast, onError }: TabProps) {
  const query = useQuery({ queryKey: ['lowcode', 'apps'], queryFn: lowcodeAdminApi.apps });
  const [detail, setDetail] = useState<LcApp | null>(null);
  const columns: AdvColumn<LcApp>[] = [
    { key: 'name', header: 'Name', sortable: true, filter: { type: 'text' }, render: (a) => a.name },
    { key: 'key', header: 'Key', mono: true, sortable: true, filter: { type: 'text' }, render: (a) => a.key },
    { key: 'description', header: 'Description', render: (a) => a.description ?? '—' },
    { key: 'status', header: 'Status', sortable: true, filter: { type: 'enum', options: ['draft', 'published', 'archived'].map((s) => ({ value: s, label: s })) }, render: (a) => <StatusChip status={a.status} /> },
  ];
  return (
    <Stack spacing={2}>
      <SectionHeader level={2} title="Apps" subtitle="Low-code application definitions" actions={<CreateAppDialog onToast={onToast} onError={onError} />} />
      {query.isError && <Alert severity="error">Failed to load apps.</Alert>}
      <AdvancedDataTable<LcApp> columns={columns} rows={query.data?.apps ?? []} rowKey={(a) => a.id} empty="No apps." onRowClick={setDetail} />
      <AppDetailDialog app={detail} onClose={() => setDetail(null)} onToast={onToast} onError={onError} />
    </Stack>
  );
}

/* ----------------------------------------------------------------- entities */

function EntitiesTab() {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['lowcode', 'entities'], queryFn: lowcodeAdminApi.entities });
  const columns: AdvColumn<Entity>[] = [
    { key: 'name', header: 'Name', sortable: true, filter: { type: 'text' }, render: (e) => e.name },
    { key: 'key', header: 'Key', mono: true, sortable: true, filter: { type: 'text' }, render: (e) => e.key },
    { key: 'fields', header: 'Fields', align: 'right', sortable: true, filter: { type: 'number', accessor: (e) => (e.fields ?? []).length }, render: (e) => (e.fields ?? []).length },
    { key: 'stateMachine', header: 'State machine', render: (e) => (e.stateMachine ? <Chip size="small" variant="outlined" label="yes" /> : '—') },
  ];
  return (
    <Stack spacing={2}>
      <SectionHeader level={2} title="Entities" subtitle="Data models with field schemas" actions={<Button variant="contained" onClick={() => navigate('/admin/lowcode/entities/new')}>New entity</Button>} />
      {query.isError && <Alert severity="error">Failed to load entities.</Alert>}
      <AdvancedDataTable<Entity> columns={columns} rows={query.data?.entities ?? []} rowKey={(e) => e.id} empty="No entities." onRowClick={(e) => navigate(`/admin/lowcode/entities/${e.id}`)} />
    </Stack>
  );
}

/* ------------------------------------------------------------------ lookups */

function LookupsTab({ onToast, onError }: TabProps) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['lowcode', 'lookups'], queryFn: lowcodeAdminApi.lookups });
  const apps = useQuery({ queryKey: ['lowcode', 'apps'], queryFn: lowcodeAdminApi.apps });
  const [edit, setEdit] = useState<Lookup | null>(null);
  const [creating, setCreating] = useState(false);
  const [createAppId, setCreateAppId] = useState<string>('');
  const [del, setDel] = useState<Lookup | null>(null);

  const saveMut = useMutation({
    mutationFn: (payload: Partial<Lookup>) => (edit ? lowcodeAdminApi.updateLookup(edit.id, payload) : lowcodeAdminApi.createLookup(payload)),
    onSuccess: () => { onToast(edit ? 'Lookup saved.' : 'Lookup created.'); qc.invalidateQueries({ queryKey: ['lowcode', 'lookups'] }); setEdit(null); setCreating(false); },
    onError,
  });
  const delMut = useMutation({
    mutationFn: () => lowcodeAdminApi.deleteLookup(del!.id),
    onSuccess: () => { onToast('Lookup deleted.'); qc.invalidateQueries({ queryKey: ['lowcode', 'lookups'] }); setDel(null); },
    onError,
  });

  const columns: AdvColumn<Lookup>[] = [
    { key: 'name', header: 'Name', sortable: true, filter: { type: 'text' }, render: (l) => l.name },
    { key: 'key', header: 'Key', mono: true, sortable: true, filter: { type: 'text' }, render: (l) => l.key },
    { key: 'source', header: 'Source', render: (l) => <Chip size="small" variant="outlined" label={l.source?.type === 'provider' ? `provider:${l.source.provider}` : 'static'} /> },
    { key: 'values', header: 'Values', align: 'right', sortable: true, filter: { type: 'number', accessor: (l) => (l.values ?? []).length }, render: (l) => (l.values ?? []).length },
    { key: '__actions', header: '', align: 'right', render: (l) => <Tooltip title="Delete"><IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDel(l); }}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip> },
  ];

  return (
    <Stack spacing={2}>
      <SectionHeader
        level={2}
        title="Lookups" subtitle="Reusable value/label option sets"
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField select size="small" label="For app" value={createAppId} onChange={(e) => setCreateAppId(e.target.value)} sx={{ minWidth: 200 }}>
              <MenuItem value=""><em>platform-global</em></MenuItem>
              {(apps.data?.apps ?? []).map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
            </TextField>
            <Button variant="contained" onClick={() => setCreating(true)}>New lookup</Button>
          </Stack>
        }
      />
      {query.isError && <Alert severity="error">Failed to load lookups.</Alert>}
      <AdvancedDataTable<Lookup> columns={columns} rows={query.data?.lookups ?? []} rowKey={(l) => l.id} empty="No lookups." onRowClick={setEdit} />
      <LookupEditorDialog
        open={!!edit || creating}
        lookup={edit}
        appId={edit ? edit.appId : (createAppId || null)}
        busy={saveMut.isPending}
        onClose={() => { setEdit(null); setCreating(false); }}
        onSave={(payload) => saveMut.mutate(payload)}
      />
      <ConfirmDangerDialog
        open={!!del}
        title={`Delete ${del?.name ?? 'lookup'}`}
        description="This permanently deletes the lookup list."
        confirmPhrase={del?.key ?? ''}
        confirmLabel="Delete lookup"
        busy={delMut.isPending}
        onCancel={() => setDel(null)}
        onConfirm={() => delMut.mutate()}
      />
    </Stack>
  );
}

/* -------------------------------------------------------------------- flows */

function FlowsTab({ onToast, onError }: TabProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['lowcode', 'flows'], queryFn: lowcodeAdminApi.flows });
  const [del, setDel] = useState<Flow | null>(null);

  const toggle = (f: Flow) =>
    lowcodeAdminApi.updateFlow(f.id, { enabled: !f.enabled })
      .then(() => { onToast(f.enabled ? 'Flow disabled.' : 'Flow enabled.'); qc.invalidateQueries({ queryKey: ['lowcode', 'flows'] }); })
      .catch(onError);
  const delMut = useMutation({
    mutationFn: () => lowcodeAdminApi.deleteFlow(del!.id),
    onSuccess: () => { onToast('Flow deleted.'); qc.invalidateQueries({ queryKey: ['lowcode', 'flows'] }); setDel(null); },
    onError,
  });

  const columns: AdvColumn<Flow>[] = [
    { key: 'name', header: 'Name', sortable: true, filter: { type: 'text' }, render: (f) => f.name },
    { key: 'key', header: 'Key', mono: true, sortable: true, filter: { type: 'text' }, render: (f) => f.key },
    { key: 'event', header: 'Event', sortable: true, filter: { type: 'text' }, render: (f) => f.event },
    { key: 'scopeType', header: 'Scope', filter: { type: 'enum', options: SCOPES.map((s) => ({ value: s, label: s })) }, render: (f) => <Chip size="small" variant="outlined" label={f.scopeType} /> },
    { key: 'enabled', header: 'Enabled', filter: { type: 'boolean', accessor: (f) => f.enabled }, render: (f) => <Switch size="small" checked={f.enabled} onClick={(e) => { e.stopPropagation(); toggle(f); }} /> },
    { key: '__actions', header: '', align: 'right', render: (f) => <Tooltip title="Delete"><IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDel(f); }}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip> },
  ];
  return (
    <Stack spacing={2}>
      <SectionHeader level={2} title="Flows" subtitle="Event-driven automation" actions={<Button variant="contained" onClick={() => navigate('/admin/lowcode/flows/new')}>New flow</Button>} />
      {query.isError && <Alert severity="error">Failed to load flows.</Alert>}
      <AdvancedDataTable<Flow> columns={columns} rows={query.data?.flows ?? []} rowKey={(f) => f.id} empty="No flows." onRowClick={(f) => navigate(`/admin/lowcode/flows/${f.id}`)} />
      <ConfirmDangerDialog
        open={!!del}
        title={`Delete ${del?.name ?? 'flow'}`}
        description="This permanently deletes the flow and stops its automation."
        confirmPhrase={del?.key ?? ''}
        confirmLabel="Delete flow"
        busy={delMut.isPending}
        onCancel={() => setDel(null)}
        onConfirm={() => delMut.mutate()}
      />
    </Stack>
  );
}

/* ------------------------------------------------------------------ records */

function RecordsTab() {
  const entities = useQuery({ queryKey: ['lowcode', 'entities'], queryFn: lowcodeAdminApi.entities });
  const [entityId, setEntityId] = useState('');
  const entity = useMemo(() => (entities.data?.entities ?? []).find((e) => e.id === entityId), [entities.data, entityId]);
  const appQ = useQuery({ queryKey: ['lowcode', 'app', entity?.appId], queryFn: () => lowcodeAdminApi.getApp(entity!.appId), enabled: !!entity });

  return (
    <Stack spacing={2}>
      <SectionHeader level={2} title="Records" subtitle="Browse and manage runtime records for an entity" />
      <TextField select size="small" label="Entity" value={entityId} onChange={(e) => setEntityId(e.target.value)} sx={{ maxWidth: 320 }}>
        <MenuItem value="">Select an entity…</MenuItem>
        {(entities.data?.entities ?? []).map((e) => <MenuItem key={e.id} value={e.id}>{e.name} ({e.key})</MenuItem>)}
      </TextField>
      {!entity && <Alert severity="info">Pick an entity to browse its records.</Alert>}
      {entity && appQ.data && <RecordsPanel entity={entity} appKey={appQ.data.app.key} />}
    </Stack>
  );
}

/* --------------------------------------------------------------------- page */

type LowcodeTab = 'apps' | 'entities' | 'lookups' | 'flows' | 'records';
const TABS: LowcodeTab[] = ['apps', 'entities', 'lookups', 'flows', 'records'];

export function LowcodeSection() {
  const [sp, setSp] = useSearchParams();
  const initial = (sp.get('tab') as LowcodeTab) || 'apps';
  const [tab, setTab] = useState<LowcodeTab>(TABS.includes(initial) ? initial : 'apps');
  const { showToast, showError, ToastHost } = useToast();
  const props: TabProps = { onToast: (m) => showToast(m, 'success'), onError: showError };
  const selectTab = (t: LowcodeTab) => { setTab(t); setSp((prev) => { prev.set('tab', t); return prev; }, { replace: true }); };
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Low-Code" subtitle="Apps, entities, lookups, flows, and records — /lowcode/api" />
      <Tabs value={tab} onChange={(_e, v) => selectTab(v)} variant="scrollable" scrollButtons="auto">
        {TABS.map((t) => <Tab key={t} value={t} label={t[0].toUpperCase() + t.slice(1)} />)}
      </Tabs>
      {tab === 'apps' && <AppsTab {...props} />}
      {tab === 'entities' && <EntitiesTab />}
      {tab === 'lookups' && <LookupsTab {...props} />}
      {tab === 'flows' && <FlowsTab {...props} />}
      {tab === 'records' && <RecordsTab />}
      {ToastHost}
    </Stack>
  );
}
