/**
 * Create/edit dialog for a moderation workflow. The ordered `steps` array is
 * edited with the recursive StepTree (which embeds ConditionTree for `condition`
 * branches). A raw-JSON escape hatch covers the whole steps array given the
 * nesting complexity.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import {
  moderatorAdminApi,
  type Step,
  type WorkflowInput,
  type WorkflowSpec,
} from '@/api/admin/moderator';
import {
  StepTree,
  editorToSteps,
  stepsToEditor,
  type EditorStep,
} from './StepTree';

interface WorkflowForm {
  name: string;
  description: string;
  enabled: boolean;
  triggerType: 'event' | 'manual';
  event: 'content_submitted';
}

function toForm(w?: WorkflowSpec | null): WorkflowForm {
  return {
    name: w?.name ?? '',
    description: w?.description ?? '',
    enabled: w?.enabled ?? true,
    triggerType: w?.trigger?.type ?? 'event',
    event: w?.trigger?.event ?? 'content_submitted',
  };
}

export function WorkflowBuilderDialog({
  open,
  workflow,
  onClose,
  onDone,
}: {
  open: boolean;
  workflow?: WorkflowSpec | null;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<WorkflowForm>(() => toForm(workflow));
  const [steps, setSteps] = useState<EditorStep[]>(() => stepsToEditor(workflow?.steps));
  const [useRaw, setUseRaw] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);

  const queuesQuery = useQuery({ queryKey: ['mod', 'queues'], queryFn: moderatorAdminApi.queues, enabled: open });
  const queueNames = (queuesQuery.data?.queues ?? []).map((qn) => qn.name);

  useEffect(() => {
    if (!open) return;
    setForm(toForm(workflow));
    setSteps(stepsToEditor(workflow?.steps));
    setUseRaw(false);
    setRawText('');
    setRawError(null);
  }, [open, workflow]);

  const set = <K extends keyof WorkflowForm>(k: K, v: WorkflowForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const resolveSteps = (): { ok: true; value: Step[] } | { ok: false } => {
    if (useRaw) {
      try {
        const parsed = JSON.parse(rawText || '[]');
        if (!Array.isArray(parsed)) {
          setRawError('Steps must be a JSON array.');
          return { ok: false };
        }
        return { ok: true, value: parsed as Step[] };
      } catch {
        setRawError('Steps is not valid JSON.');
        return { ok: false };
      }
    }
    return { ok: true, value: editorToSteps(steps) };
  };

  const toggleRaw = () => {
    if (!useRaw) {
      setRawText(JSON.stringify(editorToSteps(steps), null, 2));
      setRawError(null);
      setUseRaw(true);
    } else {
      try {
        const parsed = JSON.parse(rawText || '[]');
        if (!Array.isArray(parsed)) {
          setRawError('Steps must be a JSON array.');
          return;
        }
        setSteps(stepsToEditor(parsed as Step[]));
        setRawError(null);
        setUseRaw(false);
      } catch {
        setRawError('Fix the JSON before switching back to the builder.');
      }
    }
  };

  const save = useMutation({
    mutationFn: (body: WorkflowInput) =>
      workflow ? moderatorAdminApi.updateWorkflow(workflow.id, body) : moderatorAdminApi.createWorkflow(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mod', 'workflows'] });
      onDone(workflow ? 'Workflow updated' : 'Workflow created');
      onClose();
    },
    onError: (e) => onDone((e as Error).message),
  });

  const submit = () => {
    const resolved = resolveSteps();
    if (!resolved.ok) return;
    save.mutate({
      name: form.name,
      description: form.description,
      enabled: form.enabled,
      trigger: form.triggerType === 'event' ? { type: 'event', event: form.event } : { type: 'manual' },
      steps: resolved.value,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{workflow ? 'Edit workflow' : 'New workflow'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField label="Name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
          <TextField label="Description" multiline minRows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
            <TextField select label="Trigger" value={form.triggerType} onChange={(e) => set('triggerType', e.target.value as 'event' | 'manual')} sx={{ minWidth: 180 }}>
              <MenuItem value="event">event</MenuItem>
              <MenuItem value="manual">manual</MenuItem>
            </TextField>
            {form.triggerType === 'event' && (
              <TextField select label="Event" value={form.event} onChange={(e) => set('event', e.target.value as 'content_submitted')} sx={{ minWidth: 220 }}>
                <MenuItem value="content_submitted">content_submitted</MenuItem>
              </TextField>
            )}
            <FormControlLabel control={<Switch checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />} label="Enabled" />
          </Stack>

          <Divider />

          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle1" fontWeight={600}>Steps</Typography>
            <Button size="small" onClick={toggleRaw}>{useRaw ? 'Visual builder' : 'Edit as JSON'}</Button>
          </Stack>
          {rawError && <Alert severity="error">{rawError}</Alert>}
          {useRaw ? (
            <TextField
              multiline
              minRows={10}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
            />
          ) : (
            <StepTree steps={steps} queueNames={queueNames} onChange={setSteps} />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!form.name || save.isPending} onClick={submit}>
          {workflow ? 'Save changes' : 'Create workflow'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
