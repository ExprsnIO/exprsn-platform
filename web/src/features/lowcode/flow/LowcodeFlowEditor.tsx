/**
 * Low-code Flow editor — a WYSIWYG canvas (trigger → condition → actions) with a
 * right-hand structured inspector. A flow fires on a hook-bus event, evaluates an
 * optional condition tree (`match`), then runs an ordered list of actions
 * (native record actions, capability-gated module writes, or plugin hook
 * actions). Save is delegated via `onSave` so the surface owns the mutation.
 */
import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Divider, FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField,
  Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import type { Flow, Entity, FlowScopeType } from '@/api/admin/lowcode';
import { useCatalog } from '../catalog';
import { FlowCanvas } from './FlowCanvas';
import { ConditionBuilder } from './ConditionBuilder';
import type { GraphNode, GraphEdge } from './graphTypes';

const KEY_RE = /^[a-z][a-z0-9_-]*$/;
const RECORD_ACTIONS = new Set(['create_record', 'update_record', 'transition_record', 'export_entity']);
const SCOPES: FlowScopeType[] = ['platform', 'organization', 'group', 'user'];

interface EAction { _id: string; type: string; [k: string]: unknown }
let _aid = 0;
const withIds = (actions: unknown[] = []): EAction[] =>
  actions.map((a) => ({ _id: `a${++_aid}`, type: 'log', ...(a as object) } as EAction));
const stripId = ({ _id, ...a }: EAction) => a;

type Sel = { kind: 'trigger' } | { kind: 'condition' } | { kind: 'action'; id: string } | null;

export function LowcodeFlowEditor({
  flow, appId, entities = [], busy, onCancel, onSave,
}: {
  flow: Flow | null;
  appId: string;
  entities?: Entity[];
  busy?: boolean;
  onCancel?: () => void;
  onSave: (payload: Partial<Flow>) => void;
}) {
  const { catalog } = useCatalog();
  const [name, setName] = useState(flow?.name ?? '');
  const [key, setKey] = useState(flow?.key ?? '');
  const [event, setEvent] = useState(flow?.event ?? '');
  const [enabled, setEnabled] = useState(flow?.enabled ?? true);
  const [scopeType, setScopeType] = useState<FlowScopeType>(flow?.scopeType ?? 'platform');
  const [match, setMatch] = useState<unknown>(flow?.match ?? null);
  const [actions, setActions] = useState<EAction[]>(() => withIds(flow?.actions));
  const [sel, setSel] = useState<Sel>({ kind: 'trigger' });
  const [error, setError] = useState<string | null>(null);
  const [matchKey, setMatchKey] = useState(0); // remounts ConditionBuilder on reset

  // ── graph projection ──────────────────────────────────────────────────────
  const { nodes, edges } = useMemo(() => {
    const ns: GraphNode[] = [];
    const es: GraphEdge[] = [];
    let y = 0;
    ns.push({ id: 'trigger', position: { x: 0, y }, data: { kind: 'trigger', badge: 'trigger', title: event || '(choose event)', subtitle: name || undefined, selected: sel?.kind === 'trigger', onSelect: () => setSel({ kind: 'trigger' }) } });
    y += 130;
    ns.push({ id: 'condition', position: { x: 0, y }, data: { kind: 'condition', badge: 'when', title: match ? 'condition' : 'always', subtitle: match ? 'edit match…' : 'no filter', selected: sel?.kind === 'condition', onSelect: () => setSel({ kind: 'condition' }) } });
    es.push({ id: 'e-trigger-condition', source: 'trigger', target: 'condition' });
    y += 130;
    let prev = 'condition';
    actions.forEach((a) => {
      ns.push({ id: a._id, position: { x: 0, y }, data: { kind: 'action', badge: a.type, title: describeAction(a), selected: sel?.kind === 'action' && sel.id === a._id, onSelect: () => setSel({ kind: 'action', id: a._id }) } });
      es.push({ id: `e-${prev}-${a._id}`, source: prev, target: a._id });
      prev = a._id; y += 120;
    });
    return { nodes: ns, edges: es };
  }, [event, name, match, actions, sel]);

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
    if (!event) { setError('Choose a trigger event.'); return; }
    for (const a of actions) if (!a.type) { setError('Every action needs a type.'); return; }
    const payload: Partial<Flow> = {
      name: name.trim(), event, enabled, scopeType,
      match: (match ?? null) as Record<string, unknown> | null,
      actions: actions.map(stripId),
    };
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
              <TextField select label="Event" size="small" value={event} onChange={(e) => setEvent(e.target.value)}>
                <MenuItem value=""><em>choose event…</em></MenuItem>
                {catalog.events.map((ev) => <MenuItem key={ev} value={ev}>{ev}</MenuItem>)}
              </TextField>
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
  return a.type;
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
          <Button size="small" onClick={openRaw}>Edit as JSON</Button>
        </>
      )}
    </Stack>
  );
}
