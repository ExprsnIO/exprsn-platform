/**
 * Structured editor for a declarative plugin's `behavior`:
 *   - `match`: the nested boolean condition tree evaluated by
 *     services/plugins/src/services/conditionEvaluator.js — groups
 *     `all`/`any`/`none` plus leaves `{ field, op, value, flags? }` where
 *     `field` is a dot-path into the event context.
 *   - `actions`: the action list run by pluginHost.runDeclarative — typed
 *     handlers `log` / `audit` / `notify` / `flag` with per-type fields.
 *
 * The parent (PluginsSection) keeps its own "Edit as JSON" escape hatch for
 * anything the form can't express, per the RuleBuilderDialog pattern.
 */
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

/* -------------------------------------------------------------- match model */

export type GroupOp = 'all' | 'any' | 'none';

/** Operators implemented by conditionEvaluator.evalLeaf. */
const OPS = [
  'exists', 'not_exists',
  'equals', 'not_equals',
  'contains', 'not_contains',
  'in', 'not_in',
  'gt', 'gte', 'lt', 'lte',
  'length_gt', 'length_lt',
  'matches',
  'keywords_any', 'keywords_all',
] as const;
export type LeafOp = (typeof OPS)[number];

const OP_LABEL: Record<LeafOp, string> = {
  exists: 'exists',
  not_exists: 'does not exist',
  equals: 'equals',
  not_equals: 'does not equal',
  contains: 'contains',
  not_contains: 'does not contain',
  in: 'is one of',
  not_in: 'is not one of',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  length_gt: 'length >',
  length_lt: 'length <',
  matches: 'matches regex',
  keywords_any: 'has any keyword',
  keywords_all: 'has all keywords',
};

const NO_VALUE_OPS: LeafOp[] = ['exists', 'not_exists'];
const NUMBER_OPS: LeafOp[] = ['gt', 'gte', 'lt', 'lte', 'length_gt', 'length_lt'];
const LIST_OPS: LeafOp[] = ['in', 'not_in', 'keywords_any', 'keywords_all'];
const TYPED_OPS: LeafOp[] = ['equals', 'not_equals'];

type ValueType = 'string' | 'number' | 'boolean';

export interface LeafDraft {
  field: string;
  op: LeafOp;
  /** Raw text form of the value; interpreted per op / valueType on build. */
  value: string;
  /** equals/not_equals compare with === — the type must match the context. */
  valueType: ValueType;
  /** Regex flags for the `matches` op (backend default "i"). */
  flags: string;
}

export type MatchNode =
  | { _id: string; kind: 'group'; op: GroupOp; children: MatchNode[] }
  | { _id: string; kind: 'leaf'; leaf: LeafDraft };

const GROUP_LABEL: Record<GroupOp, string> = { all: 'ALL of (AND)', any: 'ANY of (OR)', none: 'NONE of (NOT)' };

let counter = 0;
const uid = () => `bn${++counter}`;

export function newLeaf(): MatchNode {
  return { _id: uid(), kind: 'leaf', leaf: { field: '', op: 'equals', value: '', valueType: 'string', flags: '' } };
}

export function newGroup(op: GroupOp = 'all'): MatchNode {
  return { _id: uid(), kind: 'group', op, children: [] };
}

/* ------------------------------------------------------------ action model */

/** Declarative action handlers in pluginHost.ACTIONS (webhook is a plugin kind, not an action). */
const ACTION_TYPES = ['log', 'audit', 'notify', 'flag'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

const ACTION_HELP: Record<ActionType, string> = {
  log: 'Structured log line (no capability required).',
  audit: 'Audit marker on the delivery record — needs emit:audit.',
  notify: 'In-app notification to the event user — needs emit:notifications.',
  flag: 'Advisory review flag (never auto-acts) — needs emit:moderator.flag.',
};

const NOTIFY_PRIORITIES = ['low', 'normal', 'high'];

export interface ActionDraft {
  _id: string;
  type: ActionType;
  message: string; // log
  note: string; // audit
  notificationType: string; // notify
  title: string; // notify
  body: string; // notify
  priority: string; // notify
  reason: string; // flag
}

export function newAction(type: ActionType = 'log'): ActionDraft {
  return { _id: uid(), type, message: '', note: '', notificationType: 'info', title: '', body: '', priority: 'normal', reason: '' };
}

/* ----------------------------------------------------------- (de)serialize */

export interface BehaviorDraft {
  match: MatchNode;
  actions: ActionDraft[];
}

export function emptyBehaviorDraft(): BehaviorDraft {
  return { match: newGroup('all'), actions: [] };
}

function splitList(s: string): string[] {
  return s.split(/[\n,]+/).map((w) => w.trim()).filter(Boolean);
}

function leafToJson(leaf: LeafDraft): Record<string, unknown> {
  const out: Record<string, unknown> = { field: leaf.field.trim(), op: leaf.op };
  if (NO_VALUE_OPS.includes(leaf.op)) return out;
  if (NUMBER_OPS.includes(leaf.op)) {
    out.value = leaf.value === '' ? 0 : Number(leaf.value);
  } else if (LIST_OPS.includes(leaf.op)) {
    out.value = splitList(leaf.value);
  } else if (TYPED_OPS.includes(leaf.op) && leaf.valueType === 'number') {
    out.value = Number(leaf.value);
  } else if (TYPED_OPS.includes(leaf.op) && leaf.valueType === 'boolean') {
    out.value = leaf.value.trim().toLowerCase() === 'true';
  } else {
    out.value = leaf.value;
  }
  if (leaf.op === 'matches' && leaf.flags.trim()) out.flags = leaf.flags.trim();
  return out;
}

function nodeToJson(node: MatchNode): Record<string, unknown> {
  if (node.kind === 'leaf') return leafToJson(node.leaf);
  return { [node.op]: node.children.map(nodeToJson) };
}

export function behaviorToJson(draft: BehaviorDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // An empty root group means "no constraint" — omit `match` entirely.
  if (!(draft.match.kind === 'group' && draft.match.children.length === 0)) {
    out.match = nodeToJson(draft.match);
  }
  out.actions = draft.actions.map((a) => {
    switch (a.type) {
      case 'log':
        return { type: 'log', ...(a.message.trim() && { message: a.message.trim() }) };
      case 'audit':
        return { type: 'audit', ...(a.note.trim() && { note: a.note.trim() }) };
      case 'notify':
        return {
          type: 'notify',
          ...(a.notificationType.trim() && { notificationType: a.notificationType.trim() }),
          ...(a.title.trim() && { title: a.title.trim() }),
          ...(a.body.trim() && { body: a.body.trim() }),
          ...(a.priority.trim() && { priority: a.priority.trim() }),
        };
      case 'flag':
        return { type: 'flag', ...(a.reason.trim() && { reason: a.reason.trim() }) };
    }
  });
  return out;
}

function leafFromJson(v: Record<string, unknown>): LeafDraft {
  const op = (OPS as readonly string[]).includes(String(v.op)) ? (v.op as LeafOp) : 'equals';
  const raw = v.value;
  let value = '';
  let valueType: ValueType = 'string';
  if (Array.isArray(raw)) value = raw.map(String).join(', ');
  else if (typeof raw === 'number') { value = String(raw); valueType = 'number'; }
  else if (typeof raw === 'boolean') { value = String(raw); valueType = 'boolean'; }
  else if (raw != null) value = String(raw);
  return { field: String(v.field ?? ''), op, value, valueType, flags: String(v.flags ?? '') };
}

/** Convert an evaluator-shaped match node back into the editor model. */
export function matchFromJson(v: unknown): MatchNode {
  if (v == null || typeof v !== 'object') return newGroup('all');
  if (Array.isArray(v)) {
    // Bare array = AND (conditionEvaluator.evaluateNode).
    return { _id: uid(), kind: 'group', op: 'all', children: v.map(matchFromJson) };
  }
  const obj = v as Record<string, unknown>;
  const groups = (['all', 'any', 'none'] as GroupOp[]).filter((k) => Array.isArray(obj[k]));
  const isLeaf = obj.op !== undefined || obj.field !== undefined;
  if (isLeaf && groups.length === 0) return { _id: uid(), kind: 'leaf', leaf: leafFromJson(obj) };
  if (isLeaf || groups.length > 1) {
    // Mixed node (leaf ANDed with group keys) — equivalent "all" wrapper.
    const children: MatchNode[] = [];
    if (isLeaf) children.push({ _id: uid(), kind: 'leaf', leaf: leafFromJson(obj) });
    for (const g of groups) {
      children.push({ _id: uid(), kind: 'group', op: g, children: (obj[g] as unknown[]).map(matchFromJson) });
    }
    return { _id: uid(), kind: 'group', op: 'all', children };
  }
  if (groups.length === 1) {
    return { _id: uid(), kind: 'group', op: groups[0], children: (obj[groups[0]] as unknown[]).map(matchFromJson) };
  }
  return newGroup('all');
}

function actionFromJson(v: unknown): ActionDraft {
  const obj = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const type = (ACTION_TYPES as readonly string[]).includes(String(obj.type)) ? (obj.type as ActionType) : 'log';
  const a = newAction(type);
  if (typeof obj.message === 'string') a.message = obj.message;
  if (typeof obj.note === 'string') a.note = obj.note;
  if (typeof obj.notificationType === 'string') a.notificationType = obj.notificationType;
  if (typeof obj.title === 'string') a.title = obj.title;
  if (typeof obj.body === 'string') a.body = obj.body;
  if (typeof obj.priority === 'string') a.priority = obj.priority;
  if (typeof obj.reason === 'string') a.reason = obj.reason;
  return a;
}

export function behaviorFromJson(v: unknown): BehaviorDraft {
  const obj = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  return {
    match: matchFromJson(obj.match),
    actions: Array.isArray(obj.actions) ? obj.actions.map(actionFromJson) : [],
  };
}

/* ------------------------------------------------------------------ render */

function LeafEditor({ leaf, onChange }: { leaf: LeafDraft; onChange: (l: LeafDraft) => void }) {
  const set = (patch: Partial<LeafDraft>) => onChange({ ...leaf, ...patch });
  const showValue = !NO_VALUE_OPS.includes(leaf.op);
  const isList = LIST_OPS.includes(leaf.op);
  const isNumber = NUMBER_OPS.includes(leaf.op) || (TYPED_OPS.includes(leaf.op) && leaf.valueType === 'number');
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          label="Field (dot-path)"
          placeholder="post.content"
          value={leaf.field}
          onChange={(e) => set({ field: e.target.value })}
          sx={{ minWidth: 200 }}
          inputProps={{ style: { fontFamily: 'monospace' } }}
        />
        <TextField select size="small" label="Operator" value={leaf.op} onChange={(e) => set({ op: e.target.value as LeafOp })} sx={{ minWidth: 180 }}>
          {OPS.map((o) => <MenuItem key={o} value={o}>{OP_LABEL[o]}</MenuItem>)}
        </TextField>
        {TYPED_OPS.includes(leaf.op) && (
          <TextField select size="small" label="Value type" value={leaf.valueType} onChange={(e) => set({ valueType: e.target.value as ValueType })} sx={{ width: 130 }}>
            <MenuItem value="string">string</MenuItem>
            <MenuItem value="number">number</MenuItem>
            <MenuItem value="boolean">boolean</MenuItem>
          </TextField>
        )}
      </Stack>
      {showValue && (
        <Stack direction="row" spacing={1}>
          {TYPED_OPS.includes(leaf.op) && leaf.valueType === 'boolean' ? (
            <TextField select size="small" label="Value" value={leaf.value === 'true' ? 'true' : 'false'} onChange={(e) => set({ value: e.target.value })} sx={{ width: 130 }}>
              <MenuItem value="true">true</MenuItem>
              <MenuItem value="false">false</MenuItem>
            </TextField>
          ) : (
            <TextField
              size="small"
              type={isNumber ? 'number' : 'text'}
              label={isList ? 'Values (comma-separated)' : leaf.op === 'matches' ? 'Pattern' : 'Value'}
              value={leaf.value}
              onChange={(e) => set({ value: e.target.value })}
              sx={{ flex: 1, minWidth: 200 }}
              inputProps={leaf.op === 'matches' ? { style: { fontFamily: 'monospace' } } : undefined}
            />
          )}
          {leaf.op === 'matches' && (
            <TextField size="small" label="Flags" placeholder="i" value={leaf.flags} onChange={(e) => set({ flags: e.target.value })} sx={{ width: 90 }} />
          )}
        </Stack>
      )}
    </Stack>
  );
}

export function MatchTree({
  node,
  onChange,
  onRemove,
  depth = 0,
}: {
  node: MatchNode;
  onChange: (n: MatchNode) => void;
  onRemove?: () => void;
  depth?: number;
}) {
  if (node.kind === 'leaf') {
    return (
      <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Box sx={{ flex: 1 }}>
            <LeafEditor leaf={node.leaf} onChange={(leaf) => onChange({ ...node, leaf })} />
          </Box>
          {onRemove && (
            <IconButton size="small" color="error" onClick={onRemove} aria-label="remove condition">
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      </Box>
    );
  }

  const updateChild = (i: number, child: MatchNode) =>
    onChange({ ...node, children: node.children.map((c, j) => (j === i ? child : c)) });
  const removeChild = (i: number) => onChange({ ...node, children: node.children.filter((_c, j) => j !== i) });
  const addChild = (child: MatchNode) => onChange({ ...node, children: [...node.children, child] });

  return (
    <Box
      sx={{
        p: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        borderLeft: '3px solid',
        borderLeftColor: depth % 2 === 0 ? 'primary.main' : 'secondary.main',
        bgcolor: depth % 2 === 0 ? 'transparent' : 'action.hover',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <TextField select size="small" label="Group" value={node.op} onChange={(e) => onChange({ ...node, op: e.target.value as GroupOp })} sx={{ minWidth: 170 }}>
          {(Object.keys(GROUP_LABEL) as GroupOp[]).map((op) => <MenuItem key={op} value={op}>{GROUP_LABEL[op]}</MenuItem>)}
        </TextField>
        <Box sx={{ flex: 1 }} />
        {onRemove && (
          <IconButton size="small" color="error" onClick={onRemove} aria-label="remove group">
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>
      <Stack spacing={1.5} sx={{ pl: 1 }}>
        {node.children.length === 0 && (
          <Typography variant="caption" color="text.secondary">No conditions — matches every event.</Typography>
        )}
        {node.children.map((child, i) => (
          <MatchTree key={child._id} node={child} depth={depth + 1} onChange={(c) => updateChild(i, c)} onRemove={() => removeChild(i)} />
        ))}
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<AddIcon />} onClick={() => addChild(newLeaf())}>Condition</Button>
          <Button size="small" startIcon={<AddIcon />} onClick={() => addChild(newGroup('all'))}>Group</Button>
        </Stack>
      </Stack>
    </Box>
  );
}

function ActionEditor({ action, onChange, onRemove }: { action: ActionDraft; onChange: (a: ActionDraft) => void; onRemove: () => void }) {
  const set = (patch: Partial<ActionDraft>) => onChange({ ...action, ...patch });
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField select size="small" label="Action" value={action.type} onChange={(e) => set({ type: e.target.value as ActionType })} sx={{ minWidth: 140 }}>
            {ACTION_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            {ACTION_HELP[action.type]}
          </Typography>
          <IconButton size="small" color="error" onClick={onRemove} aria-label="remove action">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
        {action.type === 'log' && (
          <TextField size="small" label="Message" value={action.message} onChange={(e) => set({ message: e.target.value })} />
        )}
        {action.type === 'audit' && (
          <TextField size="small" label="Note" value={action.note} onChange={(e) => set({ note: e.target.value })} helperText="empty = audit:<event>" />
        )}
        {action.type === 'notify' && (
          <>
            <Stack direction="row" spacing={1}>
              <TextField size="small" label="Notification type" value={action.notificationType} onChange={(e) => set({ notificationType: e.target.value })} sx={{ width: 170 }} helperText="default info" />
              <TextField select size="small" label="Priority" value={NOTIFY_PRIORITIES.includes(action.priority) ? action.priority : 'normal'} onChange={(e) => set({ priority: e.target.value })} sx={{ width: 130 }}>
                {NOTIFY_PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Title" value={action.title} onChange={(e) => set({ title: e.target.value })} sx={{ flex: 1 }} helperText="default = plugin key" />
            </Stack>
            <TextField size="small" multiline minRows={2} label="Body" value={action.body} onChange={(e) => set({ body: e.target.value })} />
          </>
        )}
        {action.type === 'flag' && (
          <TextField size="small" label="Reason" value={action.reason} onChange={(e) => set({ reason: e.target.value })} />
        )}
      </Stack>
    </Paper>
  );
}

export function BehaviorEditor({ value, onChange }: { value: BehaviorDraft; onChange: (d: BehaviorDraft) => void }) {
  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Match (when should this plugin act?)</Typography>
      <MatchTree node={value.match} onChange={(match) => onChange({ ...value, match })} />
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2">Actions</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange({ ...value, actions: [...value.actions, newAction()] })}>
          Add action
        </Button>
      </Stack>
      {value.actions.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          No actions — matched events are only recorded in the delivery log.
        </Typography>
      )}
      {value.actions.map((a, i) => (
        <ActionEditor
          key={a._id}
          action={a}
          onChange={(next) => onChange({ ...value, actions: value.actions.map((x, j) => (j === i ? next : x)) })}
          onRemove={() => onChange({ ...value, actions: value.actions.filter((_x, j) => j !== i) })}
        />
      ))}
    </Stack>
  );
}
