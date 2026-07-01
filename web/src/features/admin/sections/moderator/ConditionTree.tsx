/**
 * Recursive editor for a moderation rule's `conditions` boolean tree.
 *
 * Internally we model each node as a tagged editor node (group or leaf) so the
 * UI is easy to manipulate, then convert to/from the engine's `ConditionNode`
 * shape (group keys `all`/`any`/`none` + flat leaf keys). A leaf in this editor
 * is a SINGLE typed condition; AND multiple leaves by wrapping them in an "all"
 * group. A raw-JSON escape hatch in the parent covers anything the form can't
 * express.
 */
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import type { ConditionNode, DidMethod } from '@/api/admin/moderator';

/* ------------------------------------------------------------- editor model */

export type GroupOp = 'all' | 'any' | 'none';
export type LeafType = 'score' | 'length' | 'keywords' | 'wordlist' | 'regex' | 'did_method';

export interface LeafData {
  type: LeafType;
  category: string; // for score: risk|toxicity|...
  min: number | '';
  max: number | '';
  keywords: string;
  keyword_match: 'any' | 'all';
  keywords_list: string;
  regex: string;
  regex_flags: string;
  did_method: DidMethod[];
}

export type EditorNode =
  | { _id: string; kind: 'group'; op: GroupOp; children: EditorNode[] }
  | { _id: string; kind: 'leaf'; leaf: LeafData };

export const SCORE_CATEGORIES = ['risk', 'toxicity', 'nsfw', 'spam', 'violence', 'hateSpeech', 'sentiment'] as const;
export const DID_METHODS: DidMethod[] = ['web', 'plc', 'exprsn'];

const GROUP_LABEL: Record<GroupOp, string> = { all: 'ALL of (AND)', any: 'ANY of (OR)', none: 'NONE of (NOT)' };
const LEAF_LABEL: Record<LeafType, string> = {
  score: 'Score range',
  length: 'Text length',
  keywords: 'Keywords',
  wordlist: 'Named word list',
  regex: 'Regex',
  did_method: 'DID method',
};

let counter = 0;
const uid = () => `n${++counter}`;

function emptyLeaf(): LeafData {
  return {
    type: 'score',
    category: 'risk',
    min: '',
    max: '',
    keywords: '',
    keyword_match: 'any',
    keywords_list: '',
    regex: '',
    regex_flags: '',
    did_method: [],
  };
}

export function newLeaf(): EditorNode {
  return { _id: uid(), kind: 'leaf', leaf: emptyLeaf() };
}

export function newGroup(op: GroupOp = 'all'): EditorNode {
  return { _id: uid(), kind: 'group', op, children: [] };
}

/* ----------------------------------------------------------- (de)serialize */

function splitWords(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

function leafToCondition(leaf: LeafData): ConditionNode {
  const o: ConditionNode = {};
  switch (leaf.type) {
    case 'score':
      if (leaf.min !== '') o[`min_${leaf.category}_score`] = Number(leaf.min);
      if (leaf.max !== '') o[`max_${leaf.category}_score`] = Number(leaf.max);
      break;
    case 'length':
      if (leaf.min !== '') o.min_length = Number(leaf.min);
      if (leaf.max !== '') o.max_length = Number(leaf.max);
      break;
    case 'keywords': {
      o.keywords = splitWords(leaf.keywords);
      o.keyword_match = leaf.keyword_match;
      break;
    }
    case 'wordlist':
      if (leaf.keywords_list.trim()) o.keywords_list = leaf.keywords_list.trim();
      break;
    case 'regex':
      o.regex = leaf.regex;
      if (leaf.regex_flags.trim()) o.regex_flags = leaf.regex_flags.trim();
      break;
    case 'did_method':
      o.did_method = leaf.did_method;
      break;
  }
  return o;
}

export function nodeToCondition(node: EditorNode): ConditionNode {
  if (node.kind === 'leaf') return leafToCondition(node.leaf);
  return { [node.op]: node.children.map(nodeToCondition) } as ConditionNode;
}

function leafFromCondition(cond: ConditionNode): LeafData {
  const leaf = emptyLeaf();
  const keys = Object.keys(cond);
  const scoreKey = keys.find((k) => /^(min|max)_(.+)_score$/.test(k));
  if (scoreKey) {
    const m = scoreKey.match(/^(?:min|max)_(.+)_score$/);
    leaf.type = 'score';
    leaf.category = m ? m[1] : 'risk';
    const minV = cond[`min_${leaf.category}_score`];
    const maxV = cond[`max_${leaf.category}_score`];
    if (typeof minV === 'number') leaf.min = minV;
    if (typeof maxV === 'number') leaf.max = maxV;
  } else if ('min_length' in cond || 'max_length' in cond) {
    leaf.type = 'length';
    if (typeof cond.min_length === 'number') leaf.min = cond.min_length;
    if (typeof cond.max_length === 'number') leaf.max = cond.max_length;
  } else if ('keywords' in cond) {
    leaf.type = 'keywords';
    leaf.keywords = Array.isArray(cond.keywords) ? cond.keywords.join('\n') : String(cond.keywords ?? '');
    leaf.keyword_match = cond.keyword_match === 'all' ? 'all' : 'any';
  } else if ('keywords_list' in cond) {
    leaf.type = 'wordlist';
    leaf.keywords_list = Array.isArray(cond.keywords_list)
      ? cond.keywords_list.join(',')
      : String(cond.keywords_list ?? '');
  } else if ('regex' in cond) {
    leaf.type = 'regex';
    leaf.regex = String(cond.regex ?? '');
    leaf.regex_flags = String(cond.regex_flags ?? '');
  } else if ('did_method' in cond) {
    leaf.type = 'did_method';
    leaf.did_method = Array.isArray(cond.did_method) ? (cond.did_method as DidMethod[]) : [];
  }
  return leaf;
}

export function nodeFromCondition(cond: ConditionNode | null | undefined): EditorNode {
  if (!cond || typeof cond !== 'object') return newGroup('all');
  const op = (['all', 'any', 'none'] as GroupOp[]).find((k) => Array.isArray(cond[k]));
  if (op) {
    return {
      _id: uid(),
      kind: 'group',
      op,
      children: (cond[op] as ConditionNode[]).map(nodeFromCondition),
    };
  }
  return { _id: uid(), kind: 'leaf', leaf: leafFromCondition(cond) };
}

/* ------------------------------------------------------------------ render */

function LeafEditor({ leaf, onChange }: { leaf: LeafData; onChange: (l: LeafData) => void }) {
  const set = (patch: Partial<LeafData>) => onChange({ ...leaf, ...patch });
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <TextField
          select
          size="small"
          label="Condition type"
          value={leaf.type}
          onChange={(e) => set({ type: e.target.value as LeafType })}
          sx={{ minWidth: 170 }}
        >
          {(Object.keys(LEAF_LABEL) as LeafType[]).map((t) => (
            <MenuItem key={t} value={t}>{LEAF_LABEL[t]}</MenuItem>
          ))}
        </TextField>

        {leaf.type === 'score' && (
          <TextField
            select
            size="small"
            label="Category"
            value={leaf.category}
            onChange={(e) => set({ category: e.target.value })}
            sx={{ minWidth: 150 }}
          >
            {SCORE_CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </TextField>
        )}
      </Stack>

      {(leaf.type === 'score' || leaf.type === 'length') && (
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            type="number"
            label={leaf.type === 'score' ? 'Min (0-100)' : 'Min length'}
            value={leaf.min}
            onChange={(e) => set({ min: e.target.value === '' ? '' : Number(e.target.value) })}
          />
          <TextField
            size="small"
            type="number"
            label={leaf.type === 'score' ? 'Max (0-100)' : 'Max length'}
            value={leaf.max}
            onChange={(e) => set({ max: e.target.value === '' ? '' : Number(e.target.value) })}
          />
        </Stack>
      )}

      {leaf.type === 'keywords' && (
        <Stack spacing={1}>
          <TextField
            size="small"
            multiline
            minRows={2}
            label="Keywords (one per line or comma-separated)"
            value={leaf.keywords}
            onChange={(e) => set({ keywords: e.target.value })}
          />
          <TextField
            select
            size="small"
            label="Match"
            value={leaf.keyword_match}
            onChange={(e) => set({ keyword_match: e.target.value as 'any' | 'all' })}
            sx={{ maxWidth: 160 }}
          >
            <MenuItem value="any">any</MenuItem>
            <MenuItem value="all">all</MenuItem>
          </TextField>
        </Stack>
      )}

      {leaf.type === 'wordlist' && (
        <TextField
          size="small"
          label="Word list name(s) (comma-separated)"
          value={leaf.keywords_list}
          onChange={(e) => set({ keywords_list: e.target.value })}
          helperText="References named lists from the Word Lists tab"
        />
      )}

      {leaf.type === 'regex' && (
        <Stack direction="row" spacing={1}>
          <TextField size="small" label="Pattern" value={leaf.regex} onChange={(e) => set({ regex: e.target.value })} sx={{ flex: 1 }} />
          <TextField size="small" label="Flags" value={leaf.regex_flags} onChange={(e) => set({ regex_flags: e.target.value })} sx={{ width: 100 }} placeholder="i" />
        </Stack>
      )}

      {leaf.type === 'did_method' && (
        <TextField
          select
          size="small"
          label="DID methods"
          SelectProps={{ multiple: true }}
          value={leaf.did_method}
          onChange={(e) =>
            set({ did_method: (typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value) as DidMethod[] })
          }
          sx={{ minWidth: 220 }}
        >
          {DID_METHODS.map((m) => (
            <MenuItem key={m} value={m}>{m}</MenuItem>
          ))}
        </TextField>
      )}
    </Stack>
  );
}

export function ConditionTree({
  node,
  onChange,
  onRemove,
  depth = 0,
}: {
  node: EditorNode;
  onChange: (n: EditorNode) => void;
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

  const updateChild = (i: number, child: EditorNode) =>
    onChange({ ...node, children: node.children.map((c, j) => (j === i ? child : c)) });
  const removeChild = (i: number) =>
    onChange({ ...node, children: node.children.filter((_c, j) => j !== i) });
  const addChild = (child: EditorNode) => onChange({ ...node, children: [...node.children, child] });

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
        <TextField
          select
          size="small"
          label="Group"
          value={node.op}
          onChange={(e) => onChange({ ...node, op: e.target.value as GroupOp })}
          sx={{ minWidth: 170 }}
        >
          {(Object.keys(GROUP_LABEL) as GroupOp[]).map((op) => (
            <MenuItem key={op} value={op}>{GROUP_LABEL[op]}</MenuItem>
          ))}
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
          <Typography variant="caption" color="text.secondary">No conditions in this group yet.</Typography>
        )}
        {node.children.map((child, i) => (
          <ConditionTree
            key={child._id}
            node={child}
            depth={depth + 1}
            onChange={(c) => updateChild(i, c)}
            onRemove={() => removeChild(i)}
          />
        ))}
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<AddIcon />} onClick={() => addChild(newLeaf())}>Condition</Button>
          <Button size="small" startIcon={<AddIcon />} onClick={() => addChild(newGroup('all'))}>Group</Button>
        </Stack>
      </Stack>
    </Box>
  );
}
