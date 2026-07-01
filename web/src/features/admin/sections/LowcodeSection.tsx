import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
} from '@mui/material';
import {
  lowcodeAdminApi,
  type LcApp,
  type Lookup,
  type Entity,
  type Flow,
  type LcRecord,
} from '@/api/admin/lowcode';
import { DataTable, JsonDialog, QueryState, SectionHeader, StatusChip, useToast } from '../ui';

interface TabProps {
  onToast: (m: string) => void;
  onError: (e: unknown) => void;
}

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
      setOpen(false);
      setKey(''); setName(''); setDescription('');
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="contained" onClick={() => setOpen(true)}>New app</Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New app</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Key" value={key} onChange={(e) => setKey(e.target.value)} fullWidth />
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

function AppsTab({ onToast, onError }: TabProps) {
  const query = useQuery({ queryKey: ['lowcode', 'apps'], queryFn: lowcodeAdminApi.apps });
  return (
    <Stack spacing={2}>
      <SectionHeader title="Apps" subtitle="Low-code application definitions" actions={<CreateAppDialog onToast={onToast} onError={onError} />} />
      <QueryState query={query} empty="No apps.">
        {(d) => (
          <DataTable<LcApp>
            rows={d.apps ?? []}
            rowKey={(a) => a.id}
            columns={[
              { key: 'name', header: 'Name', render: (a) => a.name },
              { key: 'key', header: 'Key', mono: true, render: (a) => a.key },
              { key: 'description', header: 'Description', render: (a) => a.description ?? '—' },
              { key: 'status', header: 'Status', render: (a) => <StatusChip status={a.status} /> },
            ]}
          />
        )}
      </QueryState>
    </Stack>
  );
}

/* ----------------------------------------------------------------- entities */

function EntityFieldsDialog({ entity, onToast, onError, onClose }: TabProps & { entity: Entity | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // Re-seed the editor whenever a different entity is opened.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (entity && seededFor !== entity.id) {
    setSeededFor(entity.id);
    setText(JSON.stringify(entity.fields ?? [], null, 2));
  }

  const save = async () => {
    if (!entity) return;
    let fields: unknown;
    try {
      fields = JSON.parse(text || '[]');
      if (!Array.isArray(fields)) throw new Error('Fields must be a JSON array.');
    } catch (e) {
      onError(e);
      return;
    }
    setBusy(true);
    try {
      await lowcodeAdminApi.updateEntity(entity.id, { fields: fields as Entity['fields'] });
      onToast('Entity fields saved.');
      qc.invalidateQueries({ queryKey: ['lowcode', 'entities'] });
      onClose();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!entity} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{entity ? `Fields · ${entity.name}` : 'Fields'}</DialogTitle>
      <DialogContent dividers>
        <TextField
          label="Fields (JSON array)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          multiline
          minRows={14}
          maxRows={28}
          fullWidth
          inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

function EntitiesTab({ onToast, onError }: TabProps) {
  const query = useQuery({ queryKey: ['lowcode', 'entities'], queryFn: lowcodeAdminApi.entities });
  const [edit, setEdit] = useState<Entity | null>(null);
  return (
    <Stack spacing={2}>
      <SectionHeader title="Entities" subtitle="Data models with field schemas" />
      <QueryState query={query} empty="No entities.">
        {(d) => (
          <DataTable<Entity>
            rows={d.entities ?? []}
            rowKey={(e) => e.id}
            columns={[
              { key: 'name', header: 'Name', render: (e) => e.name },
              { key: 'key', header: 'Key', mono: true, render: (e) => e.key },
              { key: 'fields', header: 'Fields', align: 'right', render: (e) => (e.fields ?? []).length },
              { key: 'stateMachine', header: 'State machine', render: (e) => e.stateMachine ? <Chip size="small" variant="outlined" label="yes" /> : '—' },
              { key: 'actions', header: '', align: 'right', render: (e) => <Button size="small" onClick={() => setEdit(e)}>Fields</Button> },
            ]}
          />
        )}
      </QueryState>
      <EntityFieldsDialog entity={edit} onToast={onToast} onError={onError} onClose={() => setEdit(null)} />
    </Stack>
  );
}

/* ------------------------------------------------------------------ lookups */

function LookupsTab() {
  const query = useQuery({ queryKey: ['lowcode', 'lookups'], queryFn: lowcodeAdminApi.lookups });
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  return (
    <Stack spacing={2}>
      <SectionHeader title="Lookups" subtitle="Reusable value/label option sets" />
      <QueryState query={query} empty="No lookups.">
        {(d) => (
          <DataTable<Lookup>
            rows={d.lookups ?? []}
            rowKey={(l) => l.id}
            columns={[
              { key: 'name', header: 'Name', render: (l) => l.name },
              { key: 'key', header: 'Key', mono: true, render: (l) => l.key },
              { key: 'values', header: 'Values', align: 'right', render: (l) => (l.values ?? []).length },
              { key: 'actions', header: '', align: 'right', render: (l) => <Button size="small" onClick={() => setView({ title: l.name, value: l.values })}>View</Button> },
            ]}
          />
        )}
      </QueryState>
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </Stack>
  );
}

/* -------------------------------------------------------------------- flows */

function FlowsTab({ onToast, onError }: TabProps) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['lowcode', 'flows'], queryFn: lowcodeAdminApi.flows });
  const toggle = (f: Flow) =>
    lowcodeAdminApi.updateFlow(f.id, { enabled: !f.enabled })
      .then(() => { onToast(f.enabled ? 'Flow disabled.' : 'Flow enabled.'); qc.invalidateQueries({ queryKey: ['lowcode', 'flows'] }); })
      .catch(onError);
  return (
    <Stack spacing={2}>
      <SectionHeader title="Flows" subtitle="Event-driven automation" />
      <QueryState query={query} empty="No flows.">
        {(d) => (
          <DataTable<Flow>
            rows={d.flows ?? []}
            rowKey={(f) => f.id}
            columns={[
              { key: 'name', header: 'Name', render: (f) => f.name },
              { key: 'key', header: 'Key', mono: true, render: (f) => f.key },
              { key: 'event', header: 'Event', render: (f) => f.event },
              { key: 'scopeType', header: 'Scope', render: (f) => <Chip size="small" variant="outlined" label={f.scopeType} /> },
              { key: 'actions', header: '', align: 'right', render: (f) => <Button size="small" color={f.enabled ? 'warning' : 'success'} onClick={() => toggle(f)}>{f.enabled ? 'Disable' : 'Enable'}</Button> },
            ]}
          />
        )}
      </QueryState>
    </Stack>
  );
}

/* ------------------------------------------------------------------ records */

function RecordsTab({ onError }: TabProps) {
  const entities = useQuery({ queryKey: ['lowcode', 'entities'], queryFn: lowcodeAdminApi.entities });
  const [entityKey, setEntityKey] = useState('');
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  const records = useQuery({
    queryKey: ['lowcode', 'records', entityKey],
    queryFn: () => lowcodeAdminApi.records(entityKey),
    enabled: !!entityKey,
  });
  void onError;
  const entity = (entities.data?.entities ?? []).find((e) => e.key === entityKey);
  // Up to a handful of scalar field columns, then a View for the full record.
  const cols = (entity?.fields ?? []).slice(0, 5);

  return (
    <Stack spacing={2}>
      <SectionHeader title="Records" subtitle="Browse runtime records for an entity" />
      <QueryState query={entities} empty="No entities — define one first.">
        {(d) => (
          <TextField select size="small" label="Entity" value={entityKey} onChange={(e) => setEntityKey(e.target.value)} sx={{ maxWidth: 280 }}>
            <MenuItem value="">Select an entity…</MenuItem>
            {(d.entities ?? []).map((e) => <MenuItem key={e.id} value={e.key}>{e.name} ({e.key})</MenuItem>)}
          </TextField>
        )}
      </QueryState>
      {!entityKey && <Alert severity="info">Pick an entity to browse its records.</Alert>}
      {entityKey && (
        <QueryState query={records} empty="No records.">
          {(d) => (
            <DataTable<LcRecord>
              rows={d.records ?? []}
              rowKey={(r, i) => String(r.id ?? i)}
              columns={[
                { key: 'id', header: 'ID', mono: true, render: (r) => String(r.id ?? '—').slice(0, 12) },
                ...cols.map((f) => ({
                  key: f.key,
                  header: f.label || f.key,
                  render: (r: LcRecord) => {
                    const v = r[f.key];
                    return v == null ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 40) : String(v);
                  },
                })),
                { key: 'actions', header: '', align: 'right' as const, render: (r: LcRecord) => <Button size="small" onClick={() => setView({ title: String(r.id ?? 'record'), value: r })}>View</Button> },
              ]}
            />
          )}
        </QueryState>
      )}
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </Stack>
  );
}

/* --------------------------------------------------------------------- page */

type LowcodeTab = 'apps' | 'entities' | 'lookups' | 'flows' | 'records';

export function LowcodeSection() {
  const [tab, setTab] = useState<LowcodeTab>('apps');
  const { showToast, showError, ToastHost } = useToast();
  const props: TabProps = { onToast: (m) => showToast(m, 'success'), onError: showError };
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Low-Code" subtitle="Apps, entities, lookups, flows, and records — /lowcode/api" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        <Tab value="apps" label="Apps" />
        <Tab value="entities" label="Entities" />
        <Tab value="lookups" label="Lookups" />
        <Tab value="flows" label="Flows" />
        <Tab value="records" label="Records" />
      </Tabs>
      {tab === 'apps' && <AppsTab {...props} />}
      {tab === 'entities' && <EntitiesTab {...props} />}
      {tab === 'lookups' && <LookupsTab />}
      {tab === 'flows' && <FlowsTab {...props} />}
      {tab === 'records' && <RecordsTab {...props} />}
      {ToastHost}
    </Stack>
  );
}
