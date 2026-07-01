/**
 * Recursive editor for a workflow's ordered `steps` array.
 *
 * Like ConditionTree, we keep an internal editor model (`EditorStep`) with stable
 * `_id`s so React identity survives editing — in particular the embedded
 * ConditionTree for `condition` steps holds a stable EditorNode rather than being
 * re-derived from the serialized ConditionNode on every keystroke. Convert to/from
 * the engine's `Step[]` shape at the dialog boundary with stepsToEditor /
 * editorToSteps.
 */
import {
  Box,
  Button,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import type { ConditionNode, RuleAction, Step, StepType } from '@/api/admin/moderator';
import {
  ConditionTree,
  newGroup,
  nodeFromCondition,
  nodeToCondition,
  type EditorNode,
} from './ConditionTree';

/* ------------------------------------------------------------- editor model */

export type EditorStep =
  | { _id: string; type: 'analyze' }
  | { _id: string; type: 'apply_rules' }
  | { _id: string; type: 'set_action'; action: RuleAction; persist: boolean }
  | { _id: string; type: 'route_queue'; queue: string }
  | { _id: string; type: 'condition'; cond: EditorNode; then: EditorStep[]; else: EditorStep[] }
  | { _id: string; type: 'notify'; target: 'moderators' | 'user'; title: string; body: string }
  | { _id: string; type: 'label'; value: string }
  | { _id: string; type: 'parallel'; steps: EditorStep[] };

const STEP_ACTIONS: RuleAction[] = [
  'auto_approve', 'approve', 'reject', 'hide', 'remove', 'warn', 'flag', 'escalate', 'require_review',
];

const STEP_TYPES: StepType[] = [
  'analyze', 'apply_rules', 'set_action', 'route_queue', 'condition', 'notify', 'label', 'parallel',
];

const STEP_LABEL: Record<StepType, string> = {
  analyze: 'Analyze (AI)',
  apply_rules: 'Apply rules',
  set_action: 'Set action',
  route_queue: 'Route to queue',
  condition: 'Condition (branch)',
  notify: 'Notify',
  label: 'Label (atproto)',
  parallel: 'Parallel',
};

let counter = 0;
const uid = () => `s${++counter}`;

export function newEditorStep(type: StepType): EditorStep {
  switch (type) {
    case 'analyze':
    case 'apply_rules':
      return { _id: uid(), type };
    case 'set_action':
      return { _id: uid(), type, action: 'flag', persist: false };
    case 'route_queue':
      return { _id: uid(), type, queue: '' };
    case 'condition':
      return { _id: uid(), type, cond: newGroup('all'), then: [], else: [] };
    case 'notify':
      return { _id: uid(), type, target: 'moderators', title: '', body: '' };
    case 'label':
      return { _id: uid(), type, value: '' };
    case 'parallel':
      return { _id: uid(), type, steps: [] };
  }
}

/* ----------------------------------------------------------- (de)serialize */

export function stepToEditor(step: Step): EditorStep {
  switch (step.type) {
    case 'analyze':
    case 'apply_rules':
      return { _id: uid(), type: step.type };
    case 'set_action':
      return { _id: uid(), type: 'set_action', action: step.action ?? 'flag', persist: !!step.persist };
    case 'route_queue':
      return { _id: uid(), type: 'route_queue', queue: step.queue ?? '' };
    case 'condition':
      return {
        _id: uid(),
        type: 'condition',
        cond: nodeFromCondition(step.if),
        then: (step.then ?? []).map(stepToEditor),
        else: (step.else ?? []).map(stepToEditor),
      };
    case 'notify':
      return { _id: uid(), type: 'notify', target: step.target ?? 'moderators', title: step.title ?? '', body: step.body ?? '' };
    case 'label':
      return { _id: uid(), type: 'label', value: step.value ?? '' };
    case 'parallel':
      return { _id: uid(), type: 'parallel', steps: (step.steps ?? []).map(stepToEditor) };
  }
}

export function editorToStep(es: EditorStep): Step {
  switch (es.type) {
    case 'analyze':
    case 'apply_rules':
      return { type: es.type };
    case 'set_action':
      return { type: 'set_action', action: es.action, persist: es.persist };
    case 'route_queue':
      return { type: 'route_queue', queue: es.queue || undefined };
    case 'condition':
      return {
        type: 'condition',
        if: nodeToCondition(es.cond) as ConditionNode,
        then: es.then.map(editorToStep),
        else: es.else.map(editorToStep),
      };
    case 'notify':
      return { type: 'notify', target: es.target, title: es.title || undefined, body: es.body || undefined };
    case 'label':
      return { type: 'label', value: es.value };
    case 'parallel':
      return { type: 'parallel', steps: es.steps.map(editorToStep) };
  }
}

export function stepsToEditor(steps?: Step[] | null): EditorStep[] {
  return (steps ?? []).map(stepToEditor);
}

export function editorToSteps(list: EditorStep[]): Step[] {
  return list.map(editorToStep);
}

/* ------------------------------------------------------------------ render */

/** Change a step's type while preserving _id, resetting to that type's defaults. */
function retype(step: EditorStep, type: StepType): EditorStep {
  if (type === step.type) return step;
  return { ...newEditorStep(type), _id: step._id };
}

function StepEditor({
  step,
  queueNames,
  onChange,
}: {
  step: EditorStep;
  queueNames: string[];
  onChange: (s: EditorStep) => void;
}) {
  switch (step.type) {
    case 'analyze':
    case 'apply_rules':
      return (
        <Typography variant="caption" color="text.secondary">
          {step.type === 'analyze' ? 'Runs the AI analysis pipeline; no parameters.' : 'Evaluates the active rule set; no parameters.'}
        </Typography>
      );
    case 'set_action':
      return (
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField select size="small" label="Action" value={step.action} onChange={(e) => onChange({ ...step, action: e.target.value as RuleAction })} sx={{ minWidth: 180 }}>
            {STEP_ACTIONS.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
          </TextField>
          <FormControlLabel control={<Switch checked={step.persist} onChange={(e) => onChange({ ...step, persist: e.target.checked })} />} label="Persist" />
        </Stack>
      );
    case 'route_queue':
      return (
        <TextField
          select={queueNames.length > 0}
          size="small"
          label="Queue"
          value={step.queue}
          onChange={(e) => onChange({ ...step, queue: e.target.value })}
          sx={{ minWidth: 220 }}
          helperText={queueNames.length === 0 ? 'No queues defined yet — type a name' : 'Queue from the Queues tab'}
        >
          {queueNames.length > 0 && [
            <MenuItem key="" value="">(none)</MenuItem>,
            ...queueNames.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>),
          ]}
        </TextField>
      );
    case 'notify':
      return (
        <Stack spacing={1.5}>
          <TextField select size="small" label="Target" value={step.target} onChange={(e) => onChange({ ...step, target: e.target.value as 'moderators' | 'user' })} sx={{ minWidth: 180 }}>
            <MenuItem value="moderators">moderators</MenuItem>
            <MenuItem value="user">user</MenuItem>
          </TextField>
          <TextField size="small" label="Title" value={step.title} onChange={(e) => onChange({ ...step, title: e.target.value })} />
          <TextField size="small" label="Body" multiline minRows={2} value={step.body} onChange={(e) => onChange({ ...step, body: e.target.value })} />
        </Stack>
      );
    case 'label':
      return (
        <TextField size="small" label="Label value" value={step.value} onChange={(e) => onChange({ ...step, value: e.target.value })} sx={{ minWidth: 260 }} helperText="atproto label value (e.g. spam, nsfw)" />
      );
    case 'condition':
      return (
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="caption" color="text.secondary">If (condition tree)</Typography>
            <ConditionTree node={step.cond} onChange={(cond) => onChange({ ...step, cond })} />
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Then</Typography>
            <StepTree steps={step.then} queueNames={queueNames} depth={1} onChange={(then) => onChange({ ...step, then })} />
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Else</Typography>
            <StepTree steps={step.else} queueNames={queueNames} depth={1} onChange={(els) => onChange({ ...step, else: els })} />
          </Box>
        </Stack>
      );
    case 'parallel':
      return (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Parallel steps</Typography>
          <StepTree steps={step.steps} queueNames={queueNames} depth={1} onChange={(steps) => onChange({ ...step, steps })} />
        </Box>
      );
  }
}

export function StepTree({
  steps,
  queueNames,
  onChange,
  depth = 0,
}: {
  steps: EditorStep[];
  queueNames: string[];
  onChange: (steps: EditorStep[]) => void;
  depth?: number;
}) {
  const update = (i: number, s: EditorStep) => onChange(steps.map((c, j) => (j === i ? s : c)));
  const remove = (i: number) => onChange(steps.filter((_c, j) => j !== i));
  const add = (type: StepType) => onChange([...steps, newEditorStep(type)]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = steps.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <Stack spacing={1.5} sx={{ pl: depth ? 1 : 0 }}>
      {steps.length === 0 && (
        <Typography variant="caption" color="text.secondary">No steps yet.</Typography>
      )}
      {steps.map((step, i) => (
        <Box
          key={step._id}
          sx={{
            p: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            borderLeft: '3px solid',
            borderLeftColor: depth % 2 === 0 ? 'primary.main' : 'secondary.main',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 18 }}>{i + 1}.</Typography>
            <TextField
              select
              size="small"
              label="Step type"
              value={step.type}
              onChange={(e) => update(i, retype(step, e.target.value as StepType))}
              sx={{ minWidth: 200 }}
            >
              {STEP_TYPES.map((t) => <MenuItem key={t} value={t}>{STEP_LABEL[t]}</MenuItem>)}
            </TextField>
            <Box sx={{ flex: 1 }} />
            <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="move up"><ArrowUpwardIcon fontSize="small" /></IconButton>
            <IconButton size="small" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="move down"><ArrowDownwardIcon fontSize="small" /></IconButton>
            <IconButton size="small" color="error" onClick={() => remove(i)} aria-label="remove step"><DeleteIcon fontSize="small" /></IconButton>
          </Stack>
          <Box sx={{ pl: 1 }}>
            <StepEditor step={step} queueNames={queueNames} onChange={(s) => update(i, s)} />
          </Box>
        </Box>
      ))}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {STEP_TYPES.map((t) => (
          <Button key={t} size="small" startIcon={<AddIcon />} onClick={() => add(t)}>{STEP_LABEL[t]}</Button>
        ))}
      </Stack>
    </Stack>
  );
}
