/**
 * Visual builder for the low-code / plugins condition tree
 * ({ all|any|none: [...] } groups + { field, op, value } leaves) evaluated by
 * services/plugins/src/services/conditionEvaluator.js. A leaf's `field` is a
 * dot-path into the event context (e.g. "record.data.status"). Emits the raw
 * condition object via onChange; a null tree means "no constraint" (always run).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

export type GroupOp = 'all' | 'any' | 'none';
export type LeafOp =
  | 'exists' | 'not_exists' | 'equals' | 'not_equals' | 'contains' | 'not_contains'
  | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'length_gt' | 'length_lt'
  | 'matches' | 'keywords_any' | 'keywords_all';

const LEAF_OPS: LeafOp[] = [
  'equals', 'not_equals', 'contains', 'not_contains', 'exists', 'not_exists',
  'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'length_gt', 'length_lt', 'matches',
  'keywords_any', 'keywords_all',
];
const NO_VALUE: LeafOp[] = ['exists', 'not_exists'];
const LIST_VALUE: LeafOp[] = ['in', 'not_in', 'keywords_any', 'keywords_all'];
const NUM_VALUE: LeafOp[] = ['gt', 'gte', 'lt', 'lte', 'length_gt', 'length_lt'];

type ENode =
  | { _id: string; kind: 'group'; op: GroupOp; children: ENode[] }
  | { _id: string; kind: 'leaf'; field: string; op: LeafOp; value: string; flags?: string };

let _uid = 0;
const uid = () => `c${++_uid}`;
const newLeaf = (): ENode => ({ _id: uid(), kind: 'leaf', field: '', op: 'equals', value: '' });
const newGroup = (op: GroupOp = 'all'): ENode => ({ _id: uid(), kind: 'group', op, children: [] });

const GROUP_KEYS: GroupOp[] = ['all', 'any', 'none'];

/** raw condition object → editor node */
function fromRaw(raw: unknown): ENode {
  if (!raw || typeof raw !== 'object') return newGroup('all');
  const obj = raw as Record<string, unknown>;
  const groupKey = GROUP_KEYS.find((k) => Array.isArray(obj[k]));
  if (groupKey) {
    return { _id: uid(), kind: 'group', op: groupKey, children: (obj[groupKey] as unknown[]).map(fromRaw) };
  }
  // leaf
  const op = (obj.op as LeafOp) ?? 'equals';
  let value = '';
  if (Array.isArray(obj.value)) value = (obj.value as unknown[]).join(', ');
  else if (obj.value != null) value = String(obj.value);
  return { _id: uid(), kind: 'leaf', field: String(obj.field ?? ''), op, value, flags: obj.flags as string | undefined };
}

/** editor node → raw condition object (null if empty) */
function toRaw(node: ENode): unknown {
  if (node.kind === 'group') {
    const children = node.children.map(toRaw).filter((c) => c != null);
    if (!children.length) return null;
    return { [node.op]: children };
  }
  if (!node.field) return null;
  const leaf: Record<string, unknown> = { field: node.field, op: node.op };
  if (!NO_VALUE.includes(node.op)) {
    if (LIST_VALUE.includes(node.op)) leaf.value = node.value.split(',').map((s) => s.trim()).filter(Boolean);
    else if (NUM_VALUE.includes(node.op)) leaf.value = Number(node.value);
    else leaf.value = node.value;
  }
  if (node.op === 'matches' && node.flags) leaf.flags = node.flags;
  return leaf;
}

function NodeEditor({ node, onChange, onRemove, depth }: {
  node: ENode; onChange: (n: ENode) => void; onRemove?: () => void; depth: number;
}) {
  if (node.kind === 'group') {
    return (
      <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 1, p: 1, ...(depth > 0 ? { ml: 1 } : {}) }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <TextField
            select size="small" value={node.op}
            onChange={(e) => onChange({ ...node, op: e.target.value as GroupOp })} sx={{ width: 110 }}
          >
            <MenuItem value="all">ALL of</MenuItem>
            <MenuItem value="any">ANY of</MenuItem>
            <MenuItem value="none">NONE of</MenuItem>
          </TextField>
          <Button size="small" startIcon={<AddIcon />} onClick={() => onChange({ ...node, children: [...node.children, newLeaf()] })}>Condition</Button>
          <Button size="small" startIcon={<AddIcon />} onClick={() => onChange({ ...node, children: [...node.children, newGroup('any')] })}>Group</Button>
          {onRemove && <IconButton size="small" color="error" onClick={onRemove} sx={{ ml: 'auto' }}><DeleteOutlineIcon fontSize="small" /></IconButton>}
        </Stack>
        <Stack spacing={1}>
          {node.children.length === 0 && <Typography variant="caption" color="text.secondary">No conditions — this group always matches.</Typography>}
          {node.children.map((child, i) => (
            <NodeEditor
              key={child._id} node={child} depth={depth + 1}
              onChange={(n) => onChange({ ...node, children: node.children.map((c, j) => (j === i ? n : c)) })}
              onRemove={() => onChange({ ...node, children: node.children.filter((_, j) => j !== i) })}
            />
          ))}
        </Stack>
      </Box>
    );
  }
  const showValue = !NO_VALUE.includes(node.op);
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <TextField size="small" label="field path" placeholder="record.data.status" value={node.field} onChange={(e) => onChange({ ...node, field: e.target.value })} sx={{ width: 200 }} />
      <TextField select size="small" label="op" value={node.op} onChange={(e) => onChange({ ...node, op: e.target.value as LeafOp })} sx={{ width: 140 }}>
        {LEAF_OPS.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
      </TextField>
      {showValue && (
        <TextField
          size="small" label={LIST_VALUE.includes(node.op) ? 'values (comma)' : 'value'}
          type={NUM_VALUE.includes(node.op) ? 'number' : 'text'}
          value={node.value} onChange={(e) => onChange({ ...node, value: e.target.value })} sx={{ width: 180 }}
        />
      )}
      {node.op === 'matches' && <TextField size="small" label="flags" value={node.flags ?? ''} onChange={(e) => onChange({ ...node, flags: e.target.value })} sx={{ width: 80 }} />}
      {onRemove && <IconButton size="small" color="error" onClick={onRemove}><DeleteOutlineIcon fontSize="small" /></IconButton>}
    </Stack>
  );
}

export function ConditionBuilder({ value, onChange }: { value: unknown; onChange: (raw: unknown) => void }) {
  // Editor state is initialized once from the incoming raw value; the parent is
  // kept in sync on every edit. Remount (via `key`) to load a different tree.
  const [root, setRoot] = useState<ENode>(() => {
    const n = fromRaw(value);
    return n.kind === 'group' ? n : { _id: uid(), kind: 'group', op: 'all', children: [n] };
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    onChange(toRaw(root));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const summary = useMemo(() => JSON.stringify(toRaw(root) ?? null), [root]);
  return (
    <Stack spacing={1}>
      <NodeEditor node={root} depth={0} onChange={setRoot} />
      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{summary}</Typography>
    </Stack>
  );
}
