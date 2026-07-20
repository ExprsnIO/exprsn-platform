/**
 * AI moderation agents admin tab — list + create/edit dialog.
 * Backend: /moderator/api/agents.
 *
 * The dialog is a structured form bound to the backend schema
 * (services/moderator/models/AIAgent.js). Threshold scores are per-category
 * numeric rows (consumed by BaseAgent.exceedsThreshold) and config is typed
 * fields for the keys the agent framework actually reads
 * (BaseAgent.determineAction, ai-provider analyze options, and the
 * rate-limit agent's `limits` map). "Edit as JSON" is a secondary escape
 * hatch only, per the RuleBuilderDialog / ToolDialog pattern.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
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

/** Score categories produced by the agents (BaseAgent.calculateRiskScore weights). */
const THRESHOLD_CATEGORIES = ['toxicity', 'nsfw', 'spam', 'violence', 'hateSpeech'];

/** Rate-limit windows understood by RateLimitDetectionAgent's default `limits`. */
const LIMIT_KEY_SUGGESTIONS = [
  'posts_per_minute', 'posts_per_hour',
  'comments_per_minute', 'comments_per_hour',
  'messages_per_minute', 'messages_per_hour',
];

interface ThresholdRow { category: string; value: number | '' }
interface LimitRow { key: string; value: number | '' }

/** Config keys the backend reads, everything else is preserved in `extra`. */
const CONFIG_NUM_KEYS = ['autoApproveThreshold', 'reviewThreshold', 'rejectThreshold', 'temperature', 'maxTokens'] as const;
type ConfigNumKey = (typeof CONFIG_NUM_KEYS)[number];

interface ConfigDraft {
  autoApproveThreshold: number | '';
  reviewThreshold: number | '';
  rejectThreshold: number | '';
  temperature: number | '';
  maxTokens: number | '';
  limits: LimitRow[];
  /** Unrecognized config keys — carried through untouched. */
  extra: Record<string, unknown>;
}

function thresholdsToRows(t: Record<string, unknown> | undefined): { rows: ThresholdRow[]; extra: Record<string, unknown> } {
  const rows: ThresholdRow[] = [];
  const extra: Record<string, unknown> = {};
  for (const [category, v] of Object.entries(t ?? {})) {
    if (typeof v === 'number') rows.push({ category, value: v });
    else extra[category] = v;
  }
  return { rows, extra };
}

function rowsToThresholds(rows: ThresholdRow[], extra: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...extra };
  for (const r of rows) {
    if (r.category.trim() && r.value !== '') out[r.category.trim()] = Number(r.value);
  }
  return out;
}

function configToDraft(c: Record<string, unknown> | undefined): ConfigDraft {
  const draft: ConfigDraft = {
    autoApproveThreshold: '', reviewThreshold: '', rejectThreshold: '',
    temperature: '', maxTokens: '', limits: [], extra: {},
  };
  for (const [k, v] of Object.entries(c ?? {})) {
    if ((CONFIG_NUM_KEYS as readonly string[]).includes(k) && typeof v === 'number') {
      draft[k as ConfigNumKey] = v;
    } else if (k === 'limits' && v != null && typeof v === 'object' && !Array.isArray(v)) {
      draft.limits = Object.entries(v as Record<string, unknown>).map(([key, val]) => ({
        key,
        value: typeof val === 'number' ? val : Number(val) || '',
      }));
    } else {
      draft.extra[k] = v;
    }
  }
  return draft;
}

function draftToConfig(d: ConfigDraft): Record<string, unknown> {
  const out: Record<string, unknown> = { ...d.extra };
  for (const k of CONFIG_NUM_KEYS) {
    const v = d[k];
    if (v !== '') out[k] = Number(v);
  }
  const limits = d.limits.filter((r) => r.key.trim() && r.value !== '');
  if (limits.length) out.limits = Object.fromEntries(limits.map((r) => [r.key.trim(), Number(r.value)]));
  return out;
}

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
  };
}

const numField = (v: number | '') => (v === '' ? '' : v);

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
  const [thresholds, setThresholds] = useState<ThresholdRow[]>([]);
  const [thresholdExtra, setThresholdExtra] = useState<Record<string, unknown>>({});
  const [config, setConfig] = useState<ConfigDraft>(() => configToDraft(undefined));
  const [useRaw, setUseRaw] = useState(false);
  const [rawThresholds, setRawThresholds] = useState('{}');
  const [rawConfig, setRawConfig] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const hydrate = (a?: ModAgent | null) => {
    setForm(toForm(a));
    const t = thresholdsToRows(a?.thresholdScores);
    setThresholds(t.rows);
    setThresholdExtra(t.extra);
    setConfig(configToDraft(a?.config));
  };

  useEffect(() => {
    if (open) {
      hydrate(agent);
      setUseRaw(false);
      setJsonError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agent]);

  const set = <K extends keyof AgentForm>(k: K, v: AgentForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setCfg = <K extends keyof ConfigDraft>(k: K, v: ConfigDraft[K]) => setConfig((c) => ({ ...c, [k]: v }));
  const setThresholdRow = (i: number, next: ThresholdRow) =>
    setThresholds((cur) => cur.map((r, j) => (j === i ? next : r)));
  const setLimitRow = (i: number, next: LimitRow) =>
    setCfg('limits', config.limits.map((r, j) => (j === i ? next : r)));

  /** Current thresholdScores/config objects from whichever editor is active. */
  const resolveJson = (): { thresholdScores: Record<string, unknown>; config: Record<string, unknown> } | null => {
    if (!useRaw) {
      return { thresholdScores: rowsToThresholds(thresholds, thresholdExtra), config: draftToConfig(config) };
    }
    try {
      const t = JSON.parse(rawThresholds || '{}');
      const c = JSON.parse(rawConfig || '{}');
      if (typeof t !== 'object' || t == null || Array.isArray(t) || typeof c !== 'object' || c == null || Array.isArray(c)) {
        throw new Error('objects required');
      }
      return { thresholdScores: t, config: c };
    } catch {
      setJsonError('Threshold scores and config must be valid JSON objects.');
      return null;
    }
  };

  const toggleRaw = () => {
    if (!useRaw) {
      setRawThresholds(JSON.stringify(rowsToThresholds(thresholds, thresholdExtra), null, 2));
      setRawConfig(JSON.stringify(draftToConfig(config), null, 2));
      setUseRaw(true);
      setJsonError(null);
      return;
    }
    const resolved = resolveJson();
    if (!resolved) return;
    const t = thresholdsToRows(resolved.thresholdScores);
    setThresholds(t.rows);
    setThresholdExtra(t.extra);
    setConfig(configToDraft(resolved.config));
    setJsonError(null);
    setUseRaw(false);
  };

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
    setJsonError(null);
    const resolved = resolveJson();
    if (!resolved) return;
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
      thresholdScores: resolved.thresholdScores,
      config: resolved.config,
    });
  };

  const extraCount = Object.keys(config.extra).length + Object.keys(thresholdExtra).length;

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
            <TextField label="Priority" type="number" inputProps={{ min: 0, max: 100 }} value={form.priority} onChange={(e) => set('priority', Number(e.target.value))} sx={{ width: 130 }} />
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
          <TextField label="Prompt template" multiline minRows={4} value={form.promptTemplate} onChange={(e) => set('promptTemplate', e.target.value)} helperText="{{content}} is replaced with the content under review" />
          <Stack direction="row" spacing={2}>
            <FormControlLabel control={<Switch checked={form.autoAction} onChange={(e) => set('autoAction', e.target.checked)} />} label="Auto action" />
            <FormControlLabel control={<Switch checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />} label="Enabled" />
          </Stack>

          <Divider />
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle1" fontWeight={600}>Thresholds &amp; scoring</Typography>
            <Button size="small" onClick={toggleRaw}>{useRaw ? 'Form view' : 'Edit as JSON'}</Button>
          </Stack>
          {jsonError && <Alert severity="error">{jsonError}</Alert>}

          {useRaw ? (
            <>
              <TextField label="Threshold scores (JSON)" multiline minRows={4} value={rawThresholds} onChange={(e) => { setRawThresholds(e.target.value); setJsonError(null); }} inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }} />
              <TextField label="Config (JSON)" multiline minRows={4} value={rawConfig} onChange={(e) => { setRawConfig(e.target.value); setJsonError(null); }} inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }} />
            </>
          ) : (
            <>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="subtitle2">Per-category thresholds</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setThresholds((t) => [...t, { category: '', value: 75 }])}>
                  Add threshold
                </Button>
              </Stack>
              {thresholds.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  No per-category thresholds — every category defaults to 75.
                </Typography>
              )}
              {thresholds.map((r, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={THRESHOLD_CATEGORIES}
                    inputValue={r.category}
                    onInputChange={(_e, v) => setThresholdRow(i, { ...r, category: v })}
                    sx={{ minWidth: 220 }}
                    renderInput={(params) => <TextField {...params} label="Category" />}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="Threshold (0-100)"
                    inputProps={{ min: 0, max: 100 }}
                    value={numField(r.value)}
                    onChange={(e) => setThresholdRow(i, { ...r, value: e.target.value === '' ? '' : Number(e.target.value) })}
                    sx={{ width: 170 }}
                  />
                  <IconButton size="small" color="error" onClick={() => setThresholds((cur) => cur.filter((_x, j) => j !== i))} aria-label="remove threshold">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}

              <Typography variant="subtitle2">Action thresholds (risk score 0-100)</Typography>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                <TextField size="small" type="number" label="Auto-approve at or below" inputProps={{ min: 0, max: 100 }} helperText="default 30" value={numField(config.autoApproveThreshold)} onChange={(e) => setCfg('autoApproveThreshold', e.target.value === '' ? '' : Number(e.target.value))} sx={{ width: 200 }} />
                <TextField size="small" type="number" label="Require review at or below" inputProps={{ min: 0, max: 100 }} helperText="default 75" value={numField(config.reviewThreshold)} onChange={(e) => setCfg('reviewThreshold', e.target.value === '' ? '' : Number(e.target.value))} sx={{ width: 200 }} />
                <TextField size="small" type="number" label="Flag at or below (reject above)" inputProps={{ min: 0, max: 100 }} helperText="default 90" value={numField(config.rejectThreshold)} onChange={(e) => setCfg('rejectThreshold', e.target.value === '' ? '' : Number(e.target.value))} sx={{ width: 220 }} />
              </Stack>

              <Typography variant="subtitle2">Provider options</Typography>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                <TextField size="small" type="number" label="Temperature" inputProps={{ min: 0, max: 2, step: 0.1 }} helperText="empty = provider default" value={numField(config.temperature)} onChange={(e) => setCfg('temperature', e.target.value === '' ? '' : Number(e.target.value))} sx={{ width: 170 }} />
                <TextField size="small" type="number" label="Max tokens" inputProps={{ min: 1 }} helperText="empty = provider default" value={numField(config.maxTokens)} onChange={(e) => setCfg('maxTokens', e.target.value === '' ? '' : Number(e.target.value))} sx={{ width: 170 }} />
              </Stack>

              {form.type === 'rate_limit_detection' && (
                <>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="subtitle2">Rate limits</Typography>
                    <Button size="small" startIcon={<AddIcon />} onClick={() => setCfg('limits', [...config.limits, { key: '', value: '' }])}>
                      Add limit
                    </Button>
                  </Stack>
                  {config.limits.length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      No overrides — the agent uses its built-in per-minute/per-hour defaults.
                    </Typography>
                  )}
                  {config.limits.map((r, i) => (
                    <Stack key={i} direction="row" spacing={1} alignItems="center">
                      <Autocomplete
                        freeSolo
                        size="small"
                        options={LIMIT_KEY_SUGGESTIONS}
                        inputValue={r.key}
                        onInputChange={(_e, v) => setLimitRow(i, { ...r, key: v })}
                        sx={{ minWidth: 260 }}
                        renderInput={(params) => <TextField {...params} label="Window" />}
                      />
                      <TextField
                        size="small"
                        type="number"
                        label="Max"
                        inputProps={{ min: 1 }}
                        value={numField(r.value)}
                        onChange={(e) => setLimitRow(i, { ...r, value: e.target.value === '' ? '' : Number(e.target.value) })}
                        sx={{ width: 130 }}
                      />
                      <IconButton size="small" color="error" onClick={() => setCfg('limits', config.limits.filter((_x, j) => j !== i))} aria-label="remove limit">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ))}
                </>
              )}

              {extraCount > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {extraCount} additional key{extraCount === 1 ? '' : 's'} preserved — use “Edit as JSON” to change them.
                </Typography>
              )}
            </>
          )}
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
