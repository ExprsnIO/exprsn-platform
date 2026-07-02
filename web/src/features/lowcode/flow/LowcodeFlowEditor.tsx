/**
 * Low-code Flow editor — a WYSIWYG canvas (trigger → condition → actions) with a
 * right-hand structured inspector. A flow fires on a hook-bus event, evaluates an
 * optional condition tree (`match`), then runs an ordered list of actions
 * (native record actions, capability-gated module writes, or plugin hook
 * actions). Save is delegated via `onSave` so the surface owns the mutation.
 */
import { useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Divider, FormControlLabel,
  IconButton, MenuItem, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { Flow, Entity, FlowScopeType, FlowTrigger, FlowTriggerType } from '@/api/admin/lowcode';
import { useCatalog } from '../catalog';
import { FlowCanvas } from './FlowCanvas';
import { ConditionBuilder } from './ConditionBuilder';
import type { GraphNode, GraphEdge } from './graphTypes';

const KEY_RE = /^[a-z][a-z0-9_-]*$/;
const RECORD_ACTIONS = new Set(['create_record', 'update_record', 'transition_record', 'export_entity']);
const SCOPES: FlowScopeType[] = ['platform', 'organization', 'group', 'user'];
const TRIGGER_TYPES: { value: FlowTriggerType; label: string; help: string }[] = [
  { value: 'event', label: 'Platform event', help: 'Fires when a hook-bus event occurs.' },
  { value: 'schedule', label: 'Schedule (cron)', help: 'Fires on a 5-field cron schedule.' },
  { value: 'webhook', label: 'Incoming webhook', help: 'Fires when an external system POSTs to the flow URL.' },
  { value: 'manual', label: 'Manual only', help: 'Only fires from the Run button.' },
];

interface EAction { _id: string; type: string; [k: string]: unknown }
let _aid = 0;
const withIds = (actions: unknown[] = []): EAction[] =>
  actions.map((a) => ({ _id: `a${++_aid}`, type: 'log', ...(a as object) } as EAction));
const stripId = ({ _id, ...a }: EAction) => a;

type Sel = { kind: 'trigger' } | { kind: 'condition' } | { kind: 'action'; id: string } | null;

export function LowcodeFlowEditor({
  flow, draft = null, appId, appKey, entities = [], busy, onCancel, onSave,
}: {
  flow: Flow | null;
  /** Seed values for a NEW flow (e.g. an AI-generated draft). */
  draft?: Partial<Flow> | null;
  appId: string;
  /** App key — used to render the webhook URL for webhook-triggered flows. */
  appKey?: string;
  entities?: Entity[];
  busy?: boolean;
  onCancel?: () => void;
  onSave: (payload: Partial<Flow>) => void;
}) {
  const { catalog } = useCatalog();
  const seed = flow ?? draft;
  const [name, setName] = useState(seed?.name ?? '');
  const [key, setKey] = useState(seed?.key ?? '');
  const [triggerType, setTriggerType] = useState<FlowTriggerType>(seed?.trigger?.type ?? 'event');
  const [cron, setCron] = useState(seed?.trigger?.cron ?? '');
  const [event, setEvent] = useState(seed?.event && !seed.event.startsWith('_') ? seed.event : '');
  const [enabled, setEnabled] = useState(seed?.enabled ?? true);
  const [scopeType, setScopeType] = useState<FlowScopeType>(seed?.scopeType ?? 'platform');
  const [match, setMatch] = useState<unknown>(seed?.match ?? null);
  const [actions, setActions] = useState<EAction[]>(() => withIds(seed?.actions));
  const [sel, setSel] = useState<Sel>({ kind: 'trigger' });
  const [error, setError] = useState<string | null>(null);
  const [matchKey, setMatchKey] = useState(0); // remounts ConditionBuilder on reset

  // ── graph projection ──────────────────────────────────────────────────────
  const { nodes, edges } = useMemo(() => {
    const ns: GraphNode[] = [];
    const es: GraphEdge[] = [];
    let y = 0;
    const triggerTitle = triggerType === 'event' ? (event || '(choose event)')
      : triggerType === 'schedule' ? `cron: ${cron || '(set schedule)'}`
      : triggerType === 'webhook' ? 'incoming webhook'
      : 'manual run';
    ns.push({ id: 'trigger', position: { x: 0, y }, data: { kind: 'trigger', badge: 'trigger', title: triggerTitle, subtitle: name || undefined, selected: sel?.kind === 'trigger', onSelect: () => setSel({ kind: 'trigger' }) } });
    y += 130;
    ns.push({ id: 'condition', position: { x: 0, y }, data: { kind: 'condition', badge: 'when', title: match ? 'condition' : 'always', subtitle: match ? 'edit match…' : 'no filter', selected: sel?.kind === 'condition', onSelect: () => setSel({ kind: 'condition' }) } });
    es.push({ id: 'e-trigger-condition', source: 'trigger', target: 'condition' });
    y += 130;
    let prev = 'condition';
    actions.forEach((a) => {
      const subtitle = [a.when ? 'when…' : null, a.onError === 'stop' ? 'stop on error' : null, a.retries ? `retries ×${a.retries}` : null].filter(Boolean).join(' · ') || undefined;
      ns.push({ id: a._id, position: { x: 0, y }, data: { kind: 'action', badge: a.type, title: describeAction(a), subtitle, selected: sel?.kind === 'action' && sel.id === a._id, onSelect: () => setSel({ kind: 'action', id: a._id }) } });
      es.push({ id: `e-${prev}-${a._id}`, source: prev, target: a._id });
      prev = a._id; y += 120;
    });
    return { nodes: ns, edges: es };
  }, [event, name, match, actions, sel, triggerType, cron]);

  const addAction = () => {
    const a: EAction = { _id: `a${++_aid}`, type: catalog.actions[0] ?? 'log' };
    setActions((xs) => [...xs, a]);
    setSel({ kind: 'action', id: a._id });
  };
  const patchAction = (id: string, patch: Partial<EAction>) => setActions((xs) => xs.map((a) => (a._id === id ? { ...a, ...patch } : a)));
  const moveAction = (id: string, dir: -1 | 1) => setActions((xs) => {
    const i = xs.findIndex((a) => a._id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= xs.length) return xs;
    const copy = [...xs]; [copy[i], copy[j]] = [copy[j], copy[i]]; return copy;
  });

  const submit = () => {
    setError(null);
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!flow && !KEY_RE.test(key)) { setError('Key must be lower-snake/kebab starting with a letter.'); return; }
    if (triggerType === 'event' && !event) { setError('Choose a trigger event.'); return; }
    if (triggerType === 'schedule' && !cron.trim()) { setError('Set a cron expression (e.g. 0 9 * * 1).'); return; }
    for (const a of actions) if (!a.type) { setError('Every action needs a type.'); return; }
    const trigger: FlowTrigger = triggerType === 'schedule' ? { type: 'schedule', cron: cron.trim() } : { type: triggerType };
    const payload: Partial<Flow> = {
      name: name.trim(), enabled, scopeType, trigger,
      match: (match ?? null) as Record<string, unknown> | null,
      actions: actions.map(stripId),
    };
    if (triggerType === 'event') payload.event = event;
    if (!flow) { payload.appId = appId; payload.key = key; }
    onSave(payload);
  };

  const selAction = sel?.kind === 'action' ? actions.find((a) => a._id === sel.id) : undefined;

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 360px' }, gap: 2 }}>
        {/* canvas */}
        <Box>
          <FlowCanvas nodes={nodes} edges={edges} height={480} />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button size="small" startIcon={<AddIcon />} onClick={addAction}>Add action</Button>
          </Stack>
        </Box>

        {/* inspector */}
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, alignSelf: 'start' }}>
          {(!sel || sel.kind === 'trigger') && (
            <Stack spacing={2}>
              <Typography variant="subtitle2">Trigger</Typography>
              <TextField label="Name" size="small" value={name} onChange={(e) => setName(e.target.value)} required />
              <TextField label="Key" size="small" value={key} disabled={!!flow} onChange={(e) => setKey(e.target.value)} helperText={flow ? 'immutable' : 'lower-snake'} />
              <TextField
                select label="Trigger type" size="small" value={triggerType}
                onChange={(e) => setTriggerType(e.target.value as FlowTriggerType)}
                helperText={TRIGGER_TYPES.find((t) => t.value === triggerType)?.help}
              >
                {TRIGGER_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
              </TextField>
              {triggerType === 'event' && (
                <TextField select label="Event" size="small" value={event} onChange={(e) => setEvent(e.target.value)}>
                  <MenuItem value=""><em>choose event…</em></MenuItem>
                  {catalog.events.map((ev) => <MenuItem key={ev} value={ev}>{ev}</MenuItem>)}
                </TextField>
              )}
              {triggerType === 'schedule' && (
                <TextField
                  label="Cron expression" size="small" value={cron} onChange={(e) => setCron(e.target.value)}
                  placeholder="0 9 * * 1" helperText="minute hour day-of-month month day-of-week"
                />
              )}
              {triggerType === 'webhook' && <WebhookInfo flow={flow} appKey={appKey} />}
              <TextField select label="Scope" size="small" value={scopeType} onChange={(e) => setScopeType(e.target.value as FlowScopeType)}>
                {SCOPES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <FormControlLabel control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />} label="Enabled" />
            </Stack>
          )}

          {sel?.kind === 'condition' && (
            <Stack spacing={1.5}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="subtitle2">Condition (match)</Typography>
                {match != null && <Button size="small" color="error" onClick={() => { setMatch(null); setMatchKey((k) => k + 1); }}>Clear</Button>}
              </Stack>
              <Typography variant="caption" color="text.secondary">Runs the actions only when this matches the event. Empty = always.</Typography>
              <ConditionBuilder key={matchKey} value={match} onChange={setMatch} />
            </Stack>
          )}

          {selAction && (
            <ActionInspector
              action={selAction}
              actionTypes={catalog.actions}
              entities={entities}
              onChange={(patch) => patchAction(selAction._id, patch)}
              onReplace={(a) => patchAction(selAction._id, { ...a })}
              onMoveUp={() => moveAction(selAction._id, -1)}
              onMoveDown={() => moveAction(selAction._id, 1)}
              onDelete={() => { setActions((xs) => xs.filter((a) => a._id !== selAction._id)); setSel({ kind: 'trigger' }); }}
            />
          )}
        </Box>
      </Box>

      <Divider />
      <Stack direction="row" spacing={1}>
        {onCancel && <Button onClick={onCancel} disabled={busy} sx={{ mr: 'auto' }}>Cancel</Button>}
        <Button variant="contained" onClick={submit} disabled={busy}>{flow ? 'Save flow' : 'Create flow'}</Button>
      </Stack>
    </Stack>
  );
}

function describeAction(a: EAction): string {
  if (a.type === 'create_record' || a.type === 'update_record') return `${a.type} → ${a.entityKey ?? '(entity)'}`;
  if (a.type === 'transition_record') return `transition → ${a.event ?? '(event)'}`;
  if (a.type === 'http_request') return `${(a.method as string) ?? 'GET'} ${(a.url as string) ?? '(url)'}`;
  return a.type;
}

/** Webhook trigger info — the flow URL and its server-generated secret. */
function WebhookInfo({ flow, appKey }: { flow: Flow | null; appKey?: string }) {
  const secret = flow?.trigger?.type === 'webhook' ? flow.trigger.secret : undefined;
  const url = flow ? `${window.location.origin}/lowcode/api/hooks/flows/${appKey ?? '<app-key>'}/${flow.key}` : null;
  if (!flow || !secret) {
    return <Alert severity="info">The webhook URL and secret are generated when you save.</Alert>;
  }
  return (
    <Alert severity="info" icon={false} sx={{ '& .MuiAlert-message': { width: '100%' } }}>
      <Stack spacing={0.5}>
        <Typography variant="caption">POST JSON to:</Typography>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{url}</Typography>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography variant="caption">Header <code>X-Hook-Token</code>: <code>{secret.slice(0, 8)}…</code></Typography>
          <Tooltip title="Copy secret">
            <IconButton size="small" onClick={() => navigator.clipboard.writeText(secret)}><ContentCopyIcon fontSize="inherit" /></IconButton>
          </Tooltip>
        </Stack>
      </Stack>
    </Alert>
  );
}

function ActionInspector({
  action, actionTypes, entities, onChange, onReplace, onMoveUp, onMoveDown, onDelete,
}: {
  action: EAction;
  actionTypes: string[];
  entities: Entity[];
  onChange: (patch: Partial<EAction>) => void;
  onReplace: (a: EAction) => void;
  onMoveUp: () => void; onMoveDown: () => void; onDelete: () => void;
}) {
  const isRecord = RECORD_ACTIONS.has(action.type);
  const [raw, setRaw] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawErr, setRawErr] = useState<string | null>(null);

  const openRaw = () => { setRawText(JSON.stringify(stripId(action), null, 2)); setRawErr(null); setRaw(true); };
  const applyRaw = () => {
    try {
      const parsed = JSON.parse(rawText);
      onReplace({ _id: action._id, ...parsed });
      setRaw(false);
    } catch { setRawErr('Not valid JSON.'); }
  };

  const dataText = typeof action.data === 'object' ? JSON.stringify(action.data, null, 2) : '';

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2">Action</Typography>
        <Stack direction="row">
          <Tooltip title="Move up"><IconButton size="small" onClick={onMoveUp}><ArrowUpwardIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Move down"><IconButton size="small" onClick={onMoveDown}><ArrowDownwardIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Delete"><IconButton size="small" color="error" onClick={onDelete}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
        </Stack>
      </Stack>

      <TextField select label="Type" size="small" value={action.type} onChange={(e) => onChange({ type: e.target.value })}>
        {actionTypes.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
      </TextField>

      {raw ? (
        <>
          {rawErr && <Alert severity="error">{rawErr}</Alert>}
          <TextField multiline minRows={6} value={rawText} onChange={(e) => setRawText(e.target.value)} inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }} />
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={applyRaw} variant="contained">Apply</Button>
            <Button size="small" onClick={() => setRaw(false)}>Cancel</Button>
          </Stack>
        </>
      ) : (
        <>
          {isRecord && (
            <TextField select label="Entity" size="small" value={(action.entityKey as string) ?? ''} onChange={(e) => onChange({ entityKey: e.target.value || undefined })}>
              <MenuItem value=""><em>event's entity</em></MenuItem>
              {entities.map((en) => <MenuItem key={en.id} value={en.key}>{en.name} ({en.key})</MenuItem>)}
            </TextField>
          )}
          {(action.type === 'create_record' || action.type === 'update_record') && (
            <TextField
              label="data (JSON)" size="small" multiline minRows={4} defaultValue={dataText}
              onBlur={(e) => { try { onChange({ data: e.target.value ? JSON.parse(e.target.value) : undefined }); } catch { /* keep typing */ } }}
              inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
              helperText="Merged into the record."
            />
          )}
          {action.type === 'transition_record' && (
            <TextField label="transition event" size="small" value={(action.event as string) ?? ''} onChange={(e) => onChange({ event: e.target.value })} />
          )}
          {(action.type === 'update_record' || action.type === 'transition_record') && (
            <TextField label="recordId (optional)" size="small" value={(action.recordId as string) ?? ''} onChange={(e) => onChange({ recordId: e.target.value || undefined })} helperText="Defaults to the event's record." />
          )}
          {action.type === 'http_request' && (
            <>
              <Stack direction="row" spacing={1}>
                <TextField select label="method" size="small" sx={{ width: 110 }} value={(action.method as string) ?? 'GET'} onChange={(e) => onChange({ method: e.target.value })}>
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </TextField>
                <TextField label="url" size="small" fullWidth value={(action.url as string) ?? ''} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://api.example.com/…" />
              </Stack>
              <TextField
                label="body (JSON, optional)" size="small" multiline minRows={3}
                defaultValue={typeof action.body === 'object' ? JSON.stringify(action.body, null, 2) : (action.body as string) ?? ''}
                onBlur={(e) => { try { onChange({ body: e.target.value ? JSON.parse(e.target.value) : undefined }); } catch { onChange({ body: e.target.value || undefined }); } }}
                inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
                helperText="Requires the app capability call:http.request. Private hosts are blocked."
              />
            </>
          )}

          {/* Per-action controls: run-condition, error policy, retries */}
          <Accordion variant="outlined" disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="caption">
                Run condition {action.when ? '(set)' : '(always)'} · on error: {(action.onError as string) ?? 'continue'} · retries: {(action.retries as number) ?? 0}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">Only run this action when:</Typography>
                  {action.when != null && <Button size="small" color="error" onClick={() => onChange({ when: undefined })}>Clear</Button>}
                </Stack>
                <ConditionBuilder value={action.when ?? null} onChange={(w) => onChange({ when: w ?? undefined })} />
                <Stack direction="row" spacing={1}>
                  <TextField select label="on error" size="small" sx={{ width: 140 }} value={(action.onError as string) ?? 'continue'} onChange={(e) => onChange({ onError: e.target.value === 'continue' ? undefined : e.target.value })}>
                    <MenuItem value="continue">continue</MenuItem>
                    <MenuItem value="stop">stop flow</MenuItem>
                  </TextField>
                  <TextField
                    label="retries" size="small" type="number" sx={{ width: 100 }}
                    value={(action.retries as number) ?? 0}
                    onChange={(e) => { const n = Math.max(0, Math.min(3, Number(e.target.value) || 0)); onChange({ retries: n || undefined }); }}
                    inputProps={{ min: 0, max: 3 }}
                  />
                </Stack>
              </Stack>
            </AccordionDetails>
          </Accordion>

          <Button size="small" onClick={openRaw}>Edit as JSON</Button>
        </>
      )}
    </Stack>
  );
}
