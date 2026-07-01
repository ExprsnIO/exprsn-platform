/**
 * AI moderation agents admin tab — list + create/edit dialog.
 * Backend: /moderator/api/agents.
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
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import {
  moderatorAdminApi,
  type AgentInput,
  type AgentProvider,
  type AgentType,
  type ContentType,
  type ModAgent,
} from '@/api/admin/moderator';
import { DataTable, QueryState, SectionHeader, StatusChip } from '../../ui';

const AGENT_TYPES: AgentType[] = [
  'text_moderation', 'image_moderation', 'video_moderation', 'spam_detection',
  'rate_limit_detection', 'hate_speech_detection', 'nsfw_detection', 'violence_detection', 'custom',
];
const PROVIDERS: AgentProvider[] = ['claude', 'openai', 'deepseek', 'local'];
const CONTENT_TYPES: ContentType[] = [
  'text', 'image', 'video', 'audio', 'post', 'comment', 'message', 'profile', 'file',
];

interface AgentForm {
  name: string;
  description: string;
  type: AgentType;
  provider: AgentProvider;
  model: string;
  promptTemplate: string;
  priority: number;
  appliesTo: ContentType[];
  autoAction: boolean;
  enabled: boolean;
  thresholdScores: string;
  config: string;
}

function toForm(a?: ModAgent | null): AgentForm {
  return {
    name: a?.name ?? '',
    description: a?.description ?? '',
    type: a?.type ?? 'text_moderation',
    provider: a?.provider ?? 'claude',
    model: a?.model ?? '',
    promptTemplate: a?.promptTemplate ?? '',
    priority: a?.priority ?? 0,
    appliesTo: (a?.appliesTo as ContentType[]) ?? [],
    autoAction: a?.autoAction ?? false,
    enabled: a?.enabled ?? true,
    thresholdScores: JSON.stringify(a?.thresholdScores ?? {}, null, 2),
    config: JSON.stringify(a?.config ?? {}, null, 2),
  };
}

function AgentDialog({
  open,
  agent,
  onClose,
  onDone,
}: {
  open: boolean;
  agent?: ModAgent | null;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<AgentForm>(() => toForm(agent));
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(toForm(agent));
      setJsonError(null);
    }
  }, [open, agent]);

  const set = <K extends keyof AgentForm>(k: K, v: AgentForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: (body: AgentInput) =>
      agent ? moderatorAdminApi.updateAgent(agent.id, body) : moderatorAdminApi.createAgent(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mod', 'agents'] });
      onDone(agent ? 'Agent updated' : 'Agent created');
      onClose();
    },
    onError: (e) => onDone((e as Error).message),
  });

  const submit = () => {
    let thresholdScores: Record<string, unknown>;
    let config: Record<string, unknown>;
    try {
      thresholdScores = JSON.parse(form.thresholdScores || '{}');
      config = JSON.parse(form.config || '{}');
    } catch {
      setJsonError('Threshold scores and config must be valid JSON.');
      return;
    }
    setJsonError(null);
    save.mutate({
      name: form.name,
      description: form.description,
      type: form.type,
      provider: form.provider,
      model: form.model,
      promptTemplate: form.promptTemplate,
      priority: Number(form.priority) || 0,
      appliesTo: form.appliesTo,
      autoAction: form.autoAction,
      enabled: form.enabled,
      thresholdScores,
      config,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{agent ? 'Edit agent' : 'New agent'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField label="Name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
          <TextField label="Description" multiline minRows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <TextField select label="Type" value={form.type} onChange={(e) => set('type', e.target.value as AgentType)} sx={{ minWidth: 200 }}>
              {AGENT_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </TextField>
            <TextField select label="Provider" value={form.provider} onChange={(e) => set('provider', e.target.value as AgentProvider)} sx={{ minWidth: 150 }}>
              {PROVIDERS.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </TextField>
            <TextField label="Model" value={form.model} onChange={(e) => set('model', e.target.value)} sx={{ minWidth: 220 }} />
            <TextField label="Priority" type="number" value={form.priority} onChange={(e) => set('priority', Number(e.target.value))} sx={{ width: 130 }} />
          </Stack>
          <TextField
            select
            label="Applies to"
            SelectProps={{ multiple: true }}
            value={form.appliesTo}
            onChange={(e) => set('appliesTo', (typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value) as ContentType[])}
            sx={{ minWidth: 260 }}
          >
            {CONTENT_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <TextField label="Prompt template" multiline minRows={4} value={form.promptTemplate} onChange={(e) => set('promptTemplate', e.target.value)} />
          <Stack direction="row" spacing={2}>
            <FormControlLabel control={<Switch checked={form.autoAction} onChange={(e) => set('autoAction', e.target.checked)} />} label="Auto action" />
            <FormControlLabel control={<Switch checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />} label="Enabled" />
          </Stack>
          {jsonError && <Alert severity="error">{jsonError}</Alert>}
          <TextField label="Threshold scores (JSON)" multiline minRows={3} value={form.thresholdScores} onChange={(e) => set('thresholdScores', e.target.value)} inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }} />
          <TextField label="Config (JSON)" multiline minRows={3} value={form.config} onChange={(e) => set('config', e.target.value)} inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!form.name || save.isPending} onClick={submit}>{agent ? 'Save changes' : 'Create agent'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function arr<T>(d: Record<string, unknown>, ...keys: string[]): T[] {
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as T[];
  return [];
}

export function AgentsTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ agent: ModAgent | null } | null>(null);
  const query = useQuery({ queryKey: ['mod', 'agents'], queryFn: moderatorAdminApi.agents });
  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { onToast(msg); qc.invalidateQueries({ queryKey: ['mod', 'agents'] }); }).catch((e) => onToast((e as Error).message));

  return (
    <Stack spacing={2}>
      <SectionHeader
        title="AI agents"
        subtitle="Automated moderation agents — /moderator/api/agents"
        actions={<Button variant="contained" onClick={() => setDialog({ agent: null })}>New agent</Button>}
      />
      <QueryState query={query} empty="No agents.">
        {(d) => (
          <DataTable
            rows={arr<ModAgent>(d, 'agents', 'data')}
            rowKey={(a) => a.id}
            columns={[
              { key: 'name', header: 'Name', render: (a) => a.name ?? '—' },
              { key: 'type', header: 'Type', render: (a) => a.type ?? '—' },
              { key: 'provider', header: 'Provider', render: (a) => a.provider ?? '—' },
              { key: 'model', header: 'Model', mono: true, render: (a) => a.model ?? '—' },
              { key: 'priority', header: 'Priority', align: 'right', render: (a) => a.priority ?? 0 },
              { key: 'enabled', header: 'Enabled', render: (a) => (a.enabled ? 'yes' : 'no') },
              { key: 'status', header: 'Status', render: (a) => <StatusChip status={a.status} /> },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (a) => (
                  <>
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => setDialog({ agent: a })}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Button size="small" onClick={() => act(() => (a.enabled ? moderatorAdminApi.disableAgent(a.id) : moderatorAdminApi.enableAgent(a.id)), 'Toggled')}>{a.enabled ? 'Disable' : 'Enable'}</Button>
                    <IconButton size="small" color="error" onClick={() => { if (confirm('Delete agent?')) act(() => moderatorAdminApi.deleteAgent(a.id), 'Deleted'); }}><DeleteIcon fontSize="small" /></IconButton>
                  </>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <AgentDialog open={!!dialog} agent={dialog?.agent} onClose={() => setDialog(null)} onDone={onToast} />
    </Stack>
  );
}
