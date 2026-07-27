import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import {
  pluginsAdminApi,
  type Plugin,
  type Installation,
  type Endpoint,
  type Delivery,
  type EndpointDirection,
  type ScopeType,
} from '@/api/admin/plugins';
import { formatDate } from '@/features/files/util';
import { Card, DataTable, DataView, JsonDialog, QueryState, SectionHeader, StatusChip, useToast } from '../ui';
import {
  BehaviorEditor,
  behaviorFromJson,
  behaviorToJson,
  emptyBehaviorDraft,
  type BehaviorDraft,
} from './PluginBehaviorEditor';

const KINDS = ['declarative', 'webhook', 'script', 'internal'];
const PLUGIN_STATUSES = ['draft', 'published', 'disabled', 'deprecated'];
const SCOPE_TYPES: ScopeType[] = ['platform', 'organization', 'group', 'user'];
const INSTALL_STATUSES = ['installed', 'enabled', 'disabled', 'error'];
const DELIVERY_STATUSES = ['queued', 'running', 'completed', 'failed', 'skipped'];

interface TabProps {
  onToast: (m: string) => void;
  onError: (e: unknown) => void;
}

/* ----------------------------------------------------------------- catalog */

// 'internal' is rejected by the validator (post-MVP tier), so the form only
// offers the three registerable kinds.
const REGISTERABLE_KINDS = ['declarative', 'webhook', 'script'];

const EMPTY_MANIFEST_FORM = {
  key: '',
  name: '',
  version: '1.0.0',
  publisher: 'exprsn',
  description: '',
  kind: 'webhook',
  capabilities: [] as string[],
  events: [] as string[],
  appliesTo: [] as string[],
  endpointUrl: '',
  endpointTimeoutMs: '',
  scriptSource: '',
};

/** Assemble a manifest object (MANIFEST_SCHEMA shape) from the form state. */
function buildManifest(f: typeof EMPTY_MANIFEST_FORM, behavior?: Record<string, unknown>): Record<string, unknown> {
  const m: Record<string, unknown> = {
    key: f.key.trim(),
    name: f.name.trim(),
    version: f.version.trim(),
    kind: f.kind,
  };
  if (f.description.trim()) m.description = f.description.trim();
  if (f.publisher.trim()) m.publisher = f.publisher.trim();
  if (f.capabilities.length) m.capabilities = f.capabilities;
  if (f.events.length) m.events = f.events;
  if (f.appliesTo.length) m.appliesTo = f.appliesTo;
  if (f.kind === 'webhook') {
    const endpoint: Record<string, unknown> = { url: f.endpointUrl.trim() };
    if (f.endpointTimeoutMs !== '') endpoint.timeoutMs = Number(f.endpointTimeoutMs);
    m.endpoint = endpoint;
    // The validator requires webhook plugins to declare call:webhook.
    if (!f.capabilities.includes('call:webhook')) m.capabilities = [...f.capabilities, 'call:webhook'];
  }
  if (f.kind === 'script') m.script = { source: f.scriptSource };
  if (f.kind === 'declarative') m.behavior = behavior ?? {};
  return m;
}

function RegisterManifestDialog({ onToast, onError }: TabProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_MANIFEST_FORM);
  const [rawMode, setRawMode] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  // Declarative `behavior` — structured builder with a scoped JSON escape hatch.
  const [behavior, setBehavior] = useState<BehaviorDraft>(emptyBehaviorDraft);
  const [behaviorRaw, setBehaviorRaw] = useState(false);
  const [behaviorText, setBehaviorText] = useState('');
  const set = <K extends keyof typeof EMPTY_MANIFEST_FORM>(k: K, v: (typeof EMPTY_MANIFEST_FORM)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  /** Resolve the behavior object from whichever editor is active. */
  const resolveBehavior = (): Record<string, unknown> | null => {
    if (!behaviorRaw) return behaviorToJson(behavior);
    try {
      const v = JSON.parse(behaviorText || '{}');
      if (typeof v !== 'object' || v == null || Array.isArray(v)) throw new Error('Behavior must be a JSON object.');
      return v as Record<string, unknown>;
    } catch (e) {
      setErrors([(e as Error).message === 'Behavior must be a JSON object.' ? (e as Error).message : 'Behavior is not valid JSON.']);
      return null;
    }
  };

  const toggleBehaviorRaw = () => {
    if (!behaviorRaw) {
      setBehaviorText(JSON.stringify(behaviorToJson(behavior), null, 2));
      setBehaviorRaw(true);
      setErrors(null);
      return;
    }
    try {
      setBehavior(behaviorFromJson(JSON.parse(behaviorText || '{}')));
      setErrors(null);
      setBehaviorRaw(false);
    } catch {
      setErrors(['Fix the behavior JSON before switching back to the builder.']);
    }
  };

  // Live vocabularies: the closed capability registry + known events/surfaces.
  const caps = useQuery({ queryKey: ['plugins', 'capabilities'], queryFn: pluginsAdminApi.capabilities, enabled: open });
  const evs = useQuery({ queryKey: ['plugins', 'events'], queryFn: pluginsAdminApi.events, enabled: open });

  const currentManifest = (): Record<string, unknown> | null => {
    if (!rawMode) {
      if (form.kind !== 'declarative') return buildManifest(form);
      const b = resolveBehavior();
      if (!b) return null;
      return buildManifest(form, b);
    }
    try {
      const v = JSON.parse(text || '{}');
      if (typeof v !== 'object' || v == null || Array.isArray(v)) throw new Error('Manifest must be a JSON object.');
      return v as Record<string, unknown>;
    } catch (e) {
      setErrors([(e as Error).message]);
      return null;
    }
  };

  const toggleRaw = () => {
    if (!rawMode) {
      const b = form.kind === 'declarative' ? resolveBehavior() : undefined;
      if (form.kind === 'declarative' && !b) return;
      setText(JSON.stringify(buildManifest(form, b ?? undefined), null, 2));
    }
    setRawMode((r) => !r);
    setErrors(null);
  };

  const validate = async () => {
    const manifest = currentManifest();
    if (!manifest) return;
    setBusy(true);
    try {
      const res = await pluginsAdminApi.validateManifest(manifest);
      setErrors(res.valid ? [] : res.errors ?? ['Invalid manifest.']);
      if (res.valid) onToast('Manifest is valid.');
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    const manifest = currentManifest();
    if (!manifest) return;
    setBusy(true);
    try {
      await pluginsAdminApi.registerPlugin(manifest);
      onToast('Plugin registered.');
      qc.invalidateQueries({ queryKey: ['plugins', 'catalog'] });
      setOpen(false);
      setErrors(null);
      setForm(EMPTY_MANIFEST_FORM);
      setBehavior(emptyBehaviorDraft());
      setBehaviorRaw(false);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const multiSelect = (
    label: string,
    value: string[],
    onChange: (v: string[]) => void,
    options: { key: string; description?: string }[],
    helper?: string,
  ) => (
    <TextField
      select
      label={label}
      value={value}
      onChange={(e) => onChange(typeof e.target.value === 'string' ? String(e.target.value).split(',') : (e.target.value as unknown as string[]))}
      SelectProps={{
        multiple: true,
        renderValue: (sel) => (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {(sel as string[]).map((v) => <Chip key={v} size="small" label={v} />)}
          </Box>
        ),
      }}
      helperText={helper}
    >
      {options.map((o) => (
        <MenuItem key={o.key} value={o.key}>
          <Stack>
            <Typography variant="body2">{o.key}</Typography>
            {o.description && <Typography variant="caption" color="text.secondary">{o.description}</Typography>}
          </Stack>
        </MenuItem>
      ))}
    </TextField>
  );

  return (
    <>
      <Button variant="contained" onClick={() => { setOpen(true); setErrors(null); }}>
        Register manifest
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Register plugin</DialogTitle>
        <DialogContent>
          {rawMode ? (
            <TextField
              label="Manifest (JSON)"
              value={text}
              onChange={(e) => { setText(e.target.value); setErrors(null); }}
              multiline
              minRows={12}
              maxRows={24}
              fullWidth
              sx={{ mt: 1 }}
              inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
            />
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Stack direction="row" spacing={2}>
                <TextField label="Key" required placeholder="my-plugin" helperText="lowercase, [a-z0-9_-]" value={form.key} onChange={(e) => set('key', e.target.value)} sx={{ flex: 1 }} />
                <TextField label="Name" required value={form.name} onChange={(e) => set('name', e.target.value)} sx={{ flex: 2 }} />
              </Stack>
              <Stack direction="row" spacing={2}>
                <TextField select label="Kind" required value={form.kind} onChange={(e) => set('kind', e.target.value)} sx={{ flex: 1 }}>
                  {REGISTERABLE_KINDS.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                </TextField>
                <TextField label="Version" required helperText="semver" value={form.version} onChange={(e) => set('version', e.target.value)} sx={{ flex: 1 }} />
                <TextField label="Publisher" value={form.publisher} onChange={(e) => set('publisher', e.target.value)} sx={{ flex: 1 }} />
              </Stack>
              <TextField label="Description" multiline minRows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
              {multiSelect('Capabilities', form.capabilities, (v) => set('capabilities', v), caps.data?.capabilities ?? [],
                form.kind === 'webhook' ? '"call:webhook" is added automatically for webhook plugins.' : undefined)}
              {multiSelect('Events', form.events, (v) => set('events', v), evs.data?.events ?? [])}
              {multiSelect('Applies to (surfaces)', form.appliesTo, (v) => set('appliesTo', v),
                (evs.data?.surfaces ?? []).map((s) => ({ key: s })))}
              {form.kind === 'webhook' && (
                <Stack direction="row" spacing={2}>
                  <TextField label="Endpoint URL" required placeholder="https://…" value={form.endpointUrl} onChange={(e) => set('endpointUrl', e.target.value)} sx={{ flex: 3 }} />
                  <TextField label="Timeout (ms)" type="number" inputProps={{ min: 250, max: 30000 }} value={form.endpointTimeoutMs} onChange={(e) => set('endpointTimeoutMs', e.target.value)} sx={{ flex: 1 }} />
                </Stack>
              )}
              {form.kind === 'script' && (
                <TextField
                  label="Script source"
                  required
                  multiline
                  minRows={6}
                  helperText="Sandboxed: only ctx + platform are in scope."
                  value={form.scriptSource}
                  onChange={(e) => set('scriptSource', e.target.value)}
                  inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
                />
              )}
              {form.kind === 'declarative' && (
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="subtitle1" fontWeight={600}>Behavior</Typography>
                    <Button size="small" onClick={toggleBehaviorRaw}>{behaviorRaw ? 'Visual builder' : 'Edit as JSON'}</Button>
                  </Stack>
                  {behaviorRaw ? (
                    <TextField
                      label="Behavior (JSON: match tree and/or actions)"
                      multiline
                      minRows={6}
                      value={behaviorText}
                      onChange={(e) => { setBehaviorText(e.target.value); setErrors(null); }}
                      inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
                    />
                  ) : (
                    <BehaviorEditor value={behavior} onChange={setBehavior} />
                  )}
                </Stack>
              )}
            </Stack>
          )}
          {errors != null && (
            errors.length === 0
              ? <Alert severity="success" sx={{ mt: 2 }}>Manifest is valid.</Alert>
              : <Alert severity="error" sx={{ mt: 2 }}><ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={toggleRaw} sx={{ mr: 'auto' }}>{rawMode ? 'Form view' : 'Edit as JSON'}</Button>
          <Button onClick={validate} disabled={busy}>Validate</Button>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={register} disabled={busy || (!rawMode && (!form.key.trim() || !form.name.trim()))}>Register</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function CatalogTab({ onToast, onError }: TabProps) {
  const qc = useQueryClient();
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  const query = useQuery({
    queryKey: ['plugins', 'catalog', kind, status],
    queryFn: () => pluginsAdminApi.plugins({ kind: kind || undefined, status: status || undefined }),
  });
  const del = (key: string) => {
    if (!confirm(`Delete plugin ${key}?`)) return;
    pluginsAdminApi.deletePlugin(key)
      .then(() => { onToast('Plugin deleted.'); qc.invalidateQueries({ queryKey: ['plugins', 'catalog'] }); })
      .catch(onError);
  };
  const inspect = (key: string) =>
    pluginsAdminApi.getPlugin(key).then((d) => setView({ title: key, value: d.plugin })).catch(onError);

  return (
    <Stack spacing={2}>
      <SectionHeader
        level={2}
        title="Catalog"
        subtitle="Registered plugins and their manifests"
        actions={<RegisterManifestDialog onToast={onToast} onError={onError} />}
      />
      <Stack direction="row" spacing={2}>
        <TextField select size="small" label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">All</MenuItem>
          {KINDS.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">All</MenuItem>
          {PLUGIN_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
      </Stack>
      <QueryState query={query} empty="No plugins registered.">
        {(d) => (
          <DataTable<Plugin>
            rows={d.plugins ?? []}
            rowKey={(p) => p.id}
            columns={[
              { key: 'name', header: 'Name', render: (p) => p.name },
              { key: 'pluginKey', header: 'Key', mono: true, render: (p) => p.pluginKey },
              { key: 'kind', header: 'Kind', render: (p) => <Chip size="small" variant="outlined" label={p.kind} /> },
              { key: 'publisher', header: 'Publisher', render: (p) => p.publisher ?? '—' },
              { key: 'latestVersion', header: 'Version', render: (p) => p.latestVersion ?? '—' },
              { key: 'status', header: 'Status', render: (p) => <StatusChip status={p.status} /> },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (p) => (
                  <>
                    <Button size="small" onClick={() => inspect(p.pluginKey)}>View</Button>
                    <IconButton size="small" color="error" onClick={() => del(p.pluginKey)}><DeleteOutlineOutlinedIcon fontSize="small" /></IconButton>
                  </>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </Stack>
  );
}

/* ----------------------------------------------------------- installations */

function InstallDialog({ onToast, onError }: TabProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pluginKey, setPluginKey] = useState('');
  const [scopeType, setScopeType] = useState<ScopeType>('platform');
  const [scopeId, setScopeId] = useState('');
  const [busy, setBusy] = useState(false);
  const plugins = useQuery({ queryKey: ['plugins', 'catalog', '', ''], queryFn: () => pluginsAdminApi.plugins() });

  const submit = async () => {
    if (!pluginKey) return;
    setBusy(true);
    try {
      await pluginsAdminApi.install({ pluginKey, scopeType, scopeId: scopeId.trim() || undefined });
      onToast('Plugin installed.');
      qc.invalidateQueries({ queryKey: ['plugins', 'installations'] });
      setOpen(false);
      setPluginKey('');
      setScopeId('');
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="contained" onClick={() => setOpen(true)}>Install plugin</Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Install plugin</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Plugin" value={pluginKey} onChange={(e) => setPluginKey(e.target.value)} fullWidth>
              {(plugins.data?.plugins ?? []).map((p) => (
                <MenuItem key={p.id} value={p.pluginKey}>{p.name} ({p.pluginKey})</MenuItem>
              ))}
            </TextField>
            <TextField select label="Scope type" value={scopeType} onChange={(e) => setScopeType(e.target.value as ScopeType)} fullWidth>
              {SCOPE_TYPES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
            {scopeType !== 'platform' && (
              <TextField label="Scope ID" value={scopeId} onChange={(e) => setScopeId(e.target.value)} fullWidth placeholder="org / group / user id" />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={busy || !pluginKey}>Install</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function InstallationsTab({ onToast, onError }: TabProps) {
  const qc = useQueryClient();
  const [scopeType, setScopeType] = useState('');
  const [status, setStatus] = useState('');
  const [transFor, setTransFor] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['plugins', 'installations', scopeType, status],
    queryFn: () => pluginsAdminApi.installations({ scopeType: scopeType || undefined, status: status || undefined }),
  });
  const transitions = useQuery({
    queryKey: ['plugins', 'transitions', transFor],
    queryFn: () => pluginsAdminApi.transitions(transFor as string),
    enabled: !!transFor,
  });
  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { onToast(msg); qc.invalidateQueries({ queryKey: ['plugins', 'installations'] }); }).catch(onError);

  return (
    <Stack spacing={2}>
      <SectionHeader level={2} title="Installations" subtitle="Per-scope installs with lifecycle state" actions={<InstallDialog onToast={onToast} onError={onError} />} />
      <Stack direction="row" spacing={2}>
        <TextField select size="small" label="Scope" value={scopeType} onChange={(e) => setScopeType(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">All</MenuItem>
          {SCOPE_TYPES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">All</MenuItem>
          {INSTALL_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
      </Stack>
      <QueryState query={query} empty="No installations.">
        {(d) => (
          <DataTable<Installation>
            rows={d.installations ?? []}
            rowKey={(it) => it.id}
            columns={[
              { key: 'plugin', header: 'Plugin', render: (it) => it.plugin?.name ?? it.plugin?.pluginKey ?? it.pluginId },
              { key: 'scopeType', header: 'Scope', render: (it) => <Chip size="small" variant="outlined" label={it.scopeId ? `${it.scopeType}:${String(it.scopeId).slice(0, 8)}` : it.scopeType} /> },
              { key: 'version', header: 'Version', render: (it) => it.version ?? '—' },
              { key: 'status', header: 'Status', render: (it) => <StatusChip status={it.status} /> },
              { key: 'lifecycleState', header: 'Lifecycle', render: (it) => it.lifecycleState ? <Chip size="small" label={it.lifecycleState} /> : '—' },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (it) => (
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    {it.status === 'enabled'
                      ? <Button size="small" color="warning" onClick={() => act(() => pluginsAdminApi.disableInstallation(it.id), 'Disabled')}>Disable</Button>
                      : <Button size="small" color="success" onClick={() => act(() => pluginsAdminApi.enableInstallation(it.id), 'Enabled')}>Enable</Button>}
                    <Button size="small" onClick={() => setTransFor(it.id)}>History</Button>
                    <IconButton size="small" color="error" onClick={() => { if (confirm('Uninstall?')) act(() => pluginsAdminApi.uninstall(it.id), 'Uninstalled'); }}><DeleteOutlineOutlinedIcon fontSize="small" /></IconButton>
                  </Stack>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <Dialog open={!!transFor} onClose={() => setTransFor(null)} fullWidth maxWidth="md">
        <DialogTitle>Lifecycle transitions</DialogTitle>
        <DialogContent dividers>
          <QueryState query={transitions} empty="No transitions recorded.">
            {(d) => (
              <DataTable
                rows={d.transitions ?? []}
                rowKey={(t, i) => String(t.id ?? i)}
                columns={[
                  { key: 'event', header: 'Event', render: (t) => t.event ?? '—' },
                  { key: 'fromState', header: 'From', render: (t) => t.fromState ?? '—' },
                  { key: 'toState', header: 'To', render: (t) => t.toState ?? '—' },
                  { key: 'createdAt', header: 'When', render: (t) => formatDate(t.createdAt) },
                ]}
              />
            )}
          </QueryState>
        </DialogContent>
        <DialogActions><Button onClick={() => setTransFor(null)}>Close</Button></DialogActions>
      </Dialog>
    </Stack>
  );
}

/* ---------------------------------------------------------------- endpoints */

function EndpointDialog({ onToast, onError }: TabProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<EndpointDirection>('outbound');
  const [method, setMethod] = useState('POST');
  const [url, setUrl] = useState('');
  const [installationId, setInstallationId] = useState('');
  const [secretRef, setSecretRef] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await pluginsAdminApi.createEndpoint({
        name: name.trim(),
        direction,
        method: method.trim() || undefined,
        url: url.trim() || undefined,
        installationId: installationId.trim() || undefined,
        secretRef: secretRef.trim() || undefined,
      });
      onToast('Endpoint created.');
      qc.invalidateQueries({ queryKey: ['plugins', 'endpoints'] });
      setOpen(false);
      setName(''); setUrl(''); setInstallationId(''); setSecretRef('');
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="contained" onClick={() => setOpen(true)}>New endpoint</Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New endpoint</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
            <TextField select label="Direction" value={direction} onChange={(e) => setDirection(e.target.value as EndpointDirection)} fullWidth>
              <MenuItem value="outbound">outbound</MenuItem>
              <MenuItem value="inbound">inbound</MenuItem>
            </TextField>
            <TextField label="Method" value={method} onChange={(e) => setMethod(e.target.value)} fullWidth />
            <TextField label="URL" value={url} onChange={(e) => setUrl(e.target.value)} fullWidth />
            <TextField label="Installation ID (optional)" value={installationId} onChange={(e) => setInstallationId(e.target.value)} fullWidth />
            <TextField label="Secret ref (optional)" value={secretRef} onChange={(e) => setSecretRef(e.target.value)} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={busy || !name.trim()}>Create</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function EndpointsTab({ onToast, onError }: TabProps) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['plugins', 'endpoints'], queryFn: () => pluginsAdminApi.endpoints() });
  const del = (id: string) => {
    if (!confirm('Delete endpoint?')) return;
    pluginsAdminApi.deleteEndpoint(id)
      .then(() => { onToast('Endpoint deleted.'); qc.invalidateQueries({ queryKey: ['plugins', 'endpoints'] }); })
      .catch(onError);
  };
  return (
    <Stack spacing={2}>
      <SectionHeader level={2} title="Endpoints" subtitle="Inbound/outbound webhook endpoints" actions={<EndpointDialog onToast={onToast} onError={onError} />} />
      <QueryState query={query} empty="No endpoints.">
        {(d) => (
          <DataTable<Endpoint>
            rows={d.endpoints ?? []}
            rowKey={(e) => e.id}
            columns={[
              { key: 'name', header: 'Name', render: (e) => e.name },
              { key: 'direction', header: 'Direction', render: (e) => <Chip size="small" variant="outlined" label={e.direction} /> },
              { key: 'method', header: 'Method', render: (e) => e.method ?? '—' },
              { key: 'url', header: 'URL', mono: true, render: (e) => e.url ?? '—' },
              { key: 'installationId', header: 'Installation', mono: true, render: (e) => e.installationId ? String(e.installationId).slice(0, 8) : '—' },
              { key: 'actions', header: '', align: 'right', render: (e) => <IconButton size="small" color="error" onClick={() => del(e.id)}><DeleteOutlineOutlinedIcon fontSize="small" /></IconButton> },
            ]}
          />
        )}
      </QueryState>
    </Stack>
  );
}

/* --------------------------------------------------------------- deliveries */

function DeliveriesTab({ onError }: TabProps) {
  const [status, setStatus] = useState('');
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  const query = useQuery({
    queryKey: ['plugins', 'deliveries', status],
    queryFn: () => pluginsAdminApi.deliveries({ status: status || undefined, limit: 100 }),
  });
  void onError;
  return (
    <Stack spacing={2}>
      <SectionHeader level={2} title="Deliveries" subtitle="Plugin event delivery log" />
      <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ maxWidth: 200 }}>
        <MenuItem value="">All</MenuItem>
        {DELIVERY_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
      </TextField>
      <QueryState query={query} empty="No deliveries.">
        {(d) => (
          <DataTable<Delivery>
            rows={d.deliveries ?? []}
            rowKey={(x) => x.id}
            columns={[
              { key: 'pluginKey', header: 'Plugin', mono: true, render: (x) => x.pluginKey },
              { key: 'event', header: 'Event', render: (x) => x.event },
              { key: 'kind', header: 'Kind', render: (x) => x.kind },
              { key: 'status', header: 'Status', render: (x) => <StatusChip status={x.status} /> },
              { key: 'attempts', header: 'Attempts', align: 'right', render: (x) => x.attempts ?? 0 },
              { key: 'responseCode', header: 'Code', align: 'right', render: (x) => x.responseCode ?? '—' },
              { key: 'createdAt', header: 'When', render: (x) => formatDate(x.createdAt) },
              { key: 'actions', header: '', align: 'right', render: (x) => <Button size="small" onClick={() => setView({ title: `${x.pluginKey} · ${x.event}`, value: x })}>View</Button> },
            ]}
          />
        )}
      </QueryState>
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </Stack>
  );
}

/* --------------------------------------------------------------- vocabulary */

function VocabularyTab() {
  const caps = useQuery({ queryKey: ['plugins', 'capabilities'], queryFn: pluginsAdminApi.capabilities });
  const events = useQuery({ queryKey: ['plugins', 'events'], queryFn: pluginsAdminApi.events });
  const lifecycle = useQuery({ queryKey: ['plugins', 'lifecycle'], queryFn: pluginsAdminApi.lifecycle });
  return (
    <Stack spacing={2}>
      <Card title="Capabilities">
        <QueryState query={caps} empty="No capabilities.">
          {(d) => (
            <DataTable
              rows={d.capabilities ?? []}
              rowKey={(c) => c.key}
              columns={[
                { key: 'key', header: 'Capability', mono: true, render: (c) => c.key },
                { key: 'description', header: 'Description', render: (c) => c.description },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <Card title="Events">
        <QueryState query={events} empty="No events.">
          {(d) => (
            <Stack spacing={1.5}>
              {d.surfaces?.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Surfaces</Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                    {d.surfaces.map((s) => <Chip key={s} size="small" variant="outlined" label={s} />)}
                  </Stack>
                </Box>
              )}
              <DataTable
                rows={d.events ?? []}
                rowKey={(e) => e.key}
                columns={[
                  { key: 'key', header: 'Event', mono: true, render: (e) => e.key },
                  { key: 'module', header: 'Module', render: (e) => e.module },
                  { key: 'description', header: 'Description', render: (e) => e.description },
                ]}
              />
            </Stack>
          )}
        </QueryState>
      </Card>
      <Card title="Lifecycle state machine">
        <QueryState query={lifecycle}>{(d) => <DataView value={d.machine} />}</QueryState>
      </Card>
    </Stack>
  );
}

/* ------------------------------------------------------------------- page */

type PluginsTab = 'catalog' | 'installations' | 'endpoints' | 'deliveries' | 'vocabulary';

export function PluginsSection() {
  const [tab, setTab] = useState<PluginsTab>('catalog');
  const { showToast, showError, ToastHost } = useToast();
  const props: TabProps = { onToast: (m) => showToast(m, 'success'), onError: showError };
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Plugins" subtitle="Plugin catalog, installations, endpoints, deliveries, and vocabulary — /plugins/api" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        <Tab value="catalog" label="Catalog" />
        <Tab value="installations" label="Installations" />
        <Tab value="endpoints" label="Endpoints" />
        <Tab value="deliveries" label="Deliveries" />
        <Tab value="vocabulary" label="Vocabulary" />
      </Tabs>
      {tab === 'catalog' && <CatalogTab {...props} />}
      {tab === 'installations' && <InstallationsTab {...props} />}
      {tab === 'endpoints' && <EndpointsTab {...props} />}
      {tab === 'deliveries' && <DeliveriesTab {...props} />}
      {tab === 'vocabulary' && <VocabularyTab />}
      {ToastHost}
    </Stack>
  );
}
