/**
 * Visual (WYSIWYG) editor for a moderation workflow. Renders the workflow's
 * step tree as a node graph (trigger → steps, with condition then/else branches
 * and parallel fan-out) and edits the selected step through a structured
 * inspector. Reuses the proven StepTree converters (stepsToEditor/editorToSteps)
 * and ConditionTree so it round-trips to the exact engine `Step[]` shape — it's
 * an alternate front-end for the same model the arrow-list builder edits.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  IconButton, MenuItem, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import {
  moderatorAdminApi, type RuleAction, type StepType, type WorkflowInput, type WorkflowSpec,
} from '@/api/admin/moderator';
import { newEditorStep, stepsToEditor, editorToSteps, type EditorStep } from './StepTree';
import { ConditionTree } from './ConditionTree';
import { FlowCanvas } from '@/features/lowcode/flow/FlowCanvas';
import type { GraphNode, GraphEdge, NodeKind } from '@/features/lowcode/flow/graphTypes';

const STEP_TYPES: StepType[] = ['analyze', 'apply_rules', 'set_action', 'route_queue', 'condition', 'notify', 'label', 'parallel'];
const STEP_LABEL: Record<StepType, string> = {
  analyze: 'Analyze (AI)', apply_rules: 'Apply rules', set_action: 'Set action', route_queue: 'Route to queue',
  condition: 'Condition (branch)', notify: 'Notify', label: 'Label', parallel: 'Parallel',
};
const STEP_ACTIONS: RuleAction[] = ['auto_approve', 'approve', 'reject', 'hide', 'remove', 'warn', 'flag', 'escalate', 'require_review'];
const COL = 260;
const ROW = 110;

/* ── tree helpers (operate on EditorStep[] by _id, across then/else/steps) ── */
function mapChildren(s: EditorStep, fn: (l: EditorStep[]) => EditorStep[]): EditorStep {
  if (s.type === 'condition') return { ...s, then: fn(s.then), else: fn(s.else) };
  if (s.type === 'parallel') return { ...s, steps: fn(s.steps) };
  return s;
}
function updateById(list: EditorStep[], id: string, patch: (s: EditorStep) => EditorStep): EditorStep[] {
  return list.map((s) => (s._id === id ? patch(s) : mapChildren(s, (l) => updateById(l, id, patch))));
}
function removeById(list: EditorStep[], id: string): EditorStep[] {
  return list.filter((s) => s._id !== id).map((s) => mapChildren(s, (l) => removeById(l, id)));
}
function reorderById(list: EditorStep[], id: string, dir: -1 | 1): EditorStep[] {
  const i = list.findIndex((s) => s._id === id);
  if (i >= 0) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const next = list.slice(); [next[i], next[j]] = [next[j], next[i]]; return next;
  }
  return list.map((s) => mapChildren(s, (l) => reorderById(l, id, dir)));
}
function findById(list: EditorStep[], id: string): EditorStep | undefined {
  for (const s of list) {
    if (s._id === id) return s;
    if (s.type === 'condition') { const r = findById(s.then, id) ?? findById(s.else, id); if (r) return r; }
    if (s.type === 'parallel') { const r = findById(s.steps, id); if (r) return r; }
  }
  return undefined;
}
function retype(step: EditorStep, type: StepType): EditorStep {
  return type === step.type ? step : { ...newEditorStep(type), _id: step._id };
}
function describeStep(s: EditorStep): string {
  switch (s.type) {
    case 'set_action': return `set → ${s.action}`;
    case 'route_queue': return `route → ${s.queue || '(auto)'}`;
    case 'notify': return `notify → ${s.target}`;
    case 'label': return `label → ${s.value || '?'}`;
    case 'parallel': return `parallel (${s.steps.length})`;
    default: return STEP_LABEL[s.type];
  }
}
const STEP_KIND: Record<StepType, NodeKind> = {
  analyze: 'action', apply_rules: 'action', set_action: 'action', route_queue: 'action',
  notify: 'action', label: 'action', condition: 'condition', parallel: 'parallel',
};

interface WorkflowForm { name: string; description: string; enabled: boolean; triggerType: 'event' | 'manual'; event: 'content_submitted' }
function toForm(w?: WorkflowSpec | null): WorkflowForm {
  return { name: w?.name ?? '', description: w?.description ?? '', enabled: w?.enabled ?? true, triggerType: w?.trigger?.type ?? 'event', event: w?.trigger?.event ?? 'content_submitted' };
}

export function WorkflowCanvasDialog({
  open, workflow, onClose, onDone,
}: {
  open: boolean;
  workflow?: WorkflowSpec | null;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<WorkflowForm>(() => toForm(workflow));
  const [steps, setSteps] = useState<EditorStep[]>(() => stepsToEditor(workflow?.steps));
  const [selId, setSelId] = useState<string | null>(null);

  const queuesQuery = useQuery({ queryKey: ['mod', 'queues'], queryFn: moderatorAdminApi.queues, enabled: open });
  const queueNames = (queuesQuery.data?.queues ?? []).map((qn) => qn.name);

  useEffect(() => {
    if (!open) return;
    setForm(toForm(workflow));
    setSteps(stepsToEditor(workflow?.steps));
    setSelId(null);
  }, [open, workflow]);

  const set = <K extends keyof WorkflowForm>(k: K, v: WorkflowForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  // ── graph projection ──
  const { nodes, edges } = useMemo(() => {
    const ns: GraphNode[] = [];
    const es: GraphEdge[] = [];
    let row = 0;
    ns.push({ id: '__trigger', position: { x: 0, y: row++ * ROW }, data: { kind: 'trigger', badge: 'trigger', title: form.triggerType === 'event' ? form.event : 'manual', subtitle: form.name || undefined } });
    const place = (s: EditorStep, x: number) => {
      const handles: Record<string, string[]> = { condition: ['out', 'then', 'else'], parallel: ['out', 'branch'] };
      ns.push({
        id: s._id, position: { x: x * COL, y: row++ * ROW },
        data: { kind: STEP_KIND[s.type], badge: s.type, title: describeStep(s), selected: selId === s._id, onSelect: () => setSelId(s._id), sourceHandles: handles[s.type] },
      });
    };
    const renderSeq = (list: EditorStep[], fromId: string, fromHandle: string, x: number, label?: string) => {
      let prev = fromId; let prevHandle = fromHandle; let first = true;
      for (const s of list) {
        place(s, x);
        es.push({ id: `e-${prev}-${s._id}-${prevHandle}`, source: prev, target: s._id, sourceHandle: prevHandle, label: first ? label : undefined });
        if (s.type === 'condition') { renderSeq(s.then, s._id, 'then', x + 1, 'then'); renderSeq(s.else, s._id, 'else', x + 1, 'else'); }
        else if (s.type === 'parallel') { for (const c of s.steps) renderSeq([c], s._id, 'branch', x + 1, 'branch'); }
        prev = s._id; prevHandle = 'out'; first = false;
      }
    };
    renderSeq(steps, '__trigger', 'out', 0);
    return { nodes: ns, edges: es };
  }, [steps, selId, form.name, form.triggerType, form.event]);

  const sel = selId ? findById(steps, selId) : undefined;

  const save = useMutation({
    mutationFn: (body: WorkflowInput) => (workflow ? moderatorAdminApi.updateWorkflow(workflow.id, body) : moderatorAdminApi.createWorkflow(body)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mod', 'workflows'] }); onDone(workflow ? 'Workflow updated' : 'Workflow created'); onClose(); },
    onError: (e) => onDone((e as Error).message),
  });

  const submit = () => save.mutate({
    name: form.name, description: form.description, enabled: form.enabled,
    trigger: form.triggerType === 'event' ? { type: 'event', event: form.event } : { type: 'manual' },
    steps: editorToSteps(steps),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{workflow ? 'Edit workflow — visual' : 'New workflow — visual'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
            <TextField label="Name" required size="small" value={form.name} onChange={(e) => set('name', e.target.value)} />
            <TextField select size="small" label="Trigger" value={form.triggerType} onChange={(e) => set('triggerType', e.target.value as 'event' | 'manual')} sx={{ minWidth: 140 }}>
              <MenuItem value="event">event</MenuItem>
              <MenuItem value="manual">manual</MenuItem>
            </TextField>
            {form.triggerType === 'event' && (
              <TextField select size="small" label="Event" value={form.event} onChange={(e) => set('event', e.target.value as 'content_submitted')} sx={{ minWidth: 200 }}>
                <MenuItem value="content_submitted">content_submitted</MenuItem>
              </TextField>
            )}
            <FormControlLabel control={<Switch checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />} label="Enabled" />
          </Stack>
          <TextField label="Description" size="small" multiline minRows={1} value={form.description} onChange={(e) => set('description', e.target.value)} />

          <Divider />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 380px' }, gap: 2 }}>
            <Box>
              <FlowCanvas nodes={nodes} edges={edges} height={500} />
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ width: '100%' }}>Add step to workflow:</Typography>
                {STEP_TYPES.map((t) => (
                  <Button key={t} size="small" startIcon={<AddIcon />} onClick={() => { const s = newEditorStep(t); setSteps((xs) => [...xs, s]); setSelId(s._id); }}>{STEP_LABEL[t]}</Button>
                ))}
              </Stack>
            </Box>

            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, alignSelf: 'start' }}>
              {!sel ? (
                <Typography variant="body2" color="text.secondary">Select a step in the canvas to edit it, or add a step below the graph.</Typography>
              ) : (
                <StepInspector
                  step={sel} queueNames={queueNames}
                  onChangeType={(t) => setSteps((xs) => updateById(xs, sel._id, (s) => retype(s, t)))}
                  onPatch={(patch) => setSteps((xs) => updateById(xs, sel._id, (s) => ({ ...s, ...patch } as EditorStep)))}
                  onAddChild={(bucket) => setSteps((xs) => updateById(xs, sel._id, (s) => {
                    const child = newEditorStep('apply_rules');
                    if (s.type === 'condition' && bucket === 'then') return { ...s, then: [...s.then, child] };
                    if (s.type === 'condition' && bucket === 'else') return { ...s, else: [...s.else, child] };
                    if (s.type === 'parallel') return { ...s, steps: [...s.steps, child] };
                    return s;
                  }))}
                  onMove={(dir) => setSteps((xs) => reorderById(xs, sel._id, dir))}
                  onDelete={() => { setSteps((xs) => removeById(xs, sel._id)); setSelId(null); }}
                />
              )}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!form.name || save.isPending} onClick={submit}>{workflow ? 'Save changes' : 'Create workflow'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function StepInspector({
  step, queueNames, onChangeType, onPatch, onAddChild, onMove, onDelete,
}: {
  step: EditorStep;
  queueNames: string[];
  onChangeType: (t: StepType) => void;
  onPatch: (patch: Partial<EditorStep>) => void;
  onAddChild: (bucket: 'then' | 'else' | 'branch') => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2">Step</Typography>
        <Stack direction="row">
          <Tooltip title="Move up"><IconButton aria-label="Move up" size="small" onClick={() => onMove(-1)}><ArrowUpwardIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Move down"><IconButton aria-label="Move down" size="small" onClick={() => onMove(1)}><ArrowDownwardIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Delete step"><IconButton aria-label="Delete step" size="small" color="error" onClick={onDelete}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
        </Stack>
      </Stack>
      <TextField select size="small" label="Step type" value={step.type} onChange={(e) => onChangeType(e.target.value as StepType)}>
        {STEP_TYPES.map((t) => <MenuItem key={t} value={t}>{STEP_LABEL[t]}</MenuItem>)}
      </TextField>

      {(step.type === 'analyze' || step.type === 'apply_rules') && (
        <Typography variant="caption" color="text.secondary">{step.type === 'analyze' ? 'Runs the AI analysis pipeline; no parameters.' : 'Evaluates the active rule set; no parameters.'}</Typography>
      )}
      {step.type === 'set_action' && (
        <Stack spacing={1}>
          <TextField select size="small" label="Action" value={step.action} onChange={(e) => onPatch({ action: e.target.value as RuleAction })}>
            {STEP_ACTIONS.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
          </TextField>
          <FormControlLabel control={<Switch checked={step.persist} onChange={(e) => onPatch({ persist: e.target.checked })} />} label="Persist to case" />
        </Stack>
      )}
      {step.type === 'route_queue' && (
        <TextField select={queueNames.length > 0} size="small" label="Queue" value={step.queue} onChange={(e) => onPatch({ queue: e.target.value })} helperText={queueNames.length === 0 ? 'No queues — type a name' : 'From the Queues tab'}>
          {queueNames.length > 0 && [<MenuItem key="" value="">(auto-route)</MenuItem>, ...queueNames.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)]}
        </TextField>
      )}
      {step.type === 'notify' && (
        <Stack spacing={1}>
          <TextField select size="small" label="Target" value={step.target} onChange={(e) => onPatch({ target: e.target.value as 'moderators' | 'user' })}>
            <MenuItem value="moderators">moderators</MenuItem>
            <MenuItem value="user">user</MenuItem>
          </TextField>
          <TextField size="small" label="Title" value={step.title} onChange={(e) => onPatch({ title: e.target.value })} />
          <TextField size="small" label="Body" multiline minRows={2} value={step.body} onChange={(e) => onPatch({ body: e.target.value })} />
        </Stack>
      )}
      {step.type === 'label' && (
        <TextField size="small" label="Label value" value={step.value} onChange={(e) => onPatch({ value: e.target.value })} helperText="e.g. spam, nsfw" />
      )}
      {step.type === 'condition' && (
        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary">If (condition tree)</Typography>
          <ConditionTree node={step.cond} onChange={(cond) => onPatch({ cond })} />
          <Stack direction="row" spacing={1}>
            <Button size="small" startIcon={<AddIcon />} onClick={() => onAddChild('then')}>Add to Then</Button>
            <Button size="small" startIcon={<AddIcon />} onClick={() => onAddChild('else')}>Add to Else</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">Branch steps appear on the canvas — click one to edit it.</Typography>
        </Stack>
      )}
      {step.type === 'parallel' && (
        <Stack spacing={1}>
          <Button size="small" startIcon={<AddIcon />} onClick={() => onAddChild('branch')}>Add parallel step</Button>
          <Typography variant="caption" color="text.secondary">Parallel branches appear on the canvas — click one to edit it.</Typography>
        </Stack>
      )}
    </Stack>
  );
}
