/**
 * Create/edit dialog for a moderation rule, including the nested `conditions`
 * boolean-tree builder (ConditionTree) and an inline rule tester. Testing needs
 * a persisted rule id, so in create mode we save first and then expose the
 * tester against the saved rule.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
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
  type ContentType,
  type Rule,
  type RuleAction,
  type RuleInput,
  type RuleScores,
} from '@/api/admin/moderator';
import {
  ConditionTree,
  newGroup,
  nodeFromCondition,
  nodeToCondition,
  type EditorNode,
} from './ConditionTree';

const ACTIONS: RuleAction[] = [
  'auto_approve', 'approve', 'reject', 'hide', 'remove', 'warn', 'flag', 'escalate', 'require_review',
];
const CONTENT_TYPES: ContentType[] = [
  'text', 'image', 'video', 'audio', 'post', 'comment', 'message', 'profile', 'file',
];
const SERVICE_SUGGESTIONS = ['bluesky', 'timeline', 'spark', 'nexus', 'filevault', 'live'];

interface FormState {
  name: string;
  description: string;
  action: RuleAction;
  priority: number;
  enabled: boolean;
  appliesTo: ContentType[];
  sourceServices: string[];
  parentRuleId: string;
  thresholdScore: number | '';
  safeguard: boolean;
  gate: boolean;
}

function ruleToForm(rule?: Rule | null): FormState {
  return {
    name: rule?.name ?? '',
    description: rule?.description ?? '',
    action: rule?.action ?? 'flag',
    priority: rule?.priority ?? 0,
    enabled: rule?.enabled ?? true,
    appliesTo: rule?.appliesTo ?? [],
    sourceServices: rule?.sourceServices ?? [],
    parentRuleId: rule?.parentRuleId ?? '',
    thresholdScore: typeof rule?.thresholdScore === 'number' ? rule.thresholdScore : '',
    safeguard: !!rule?.metadata?.safeguard,
    gate: !!rule?.metadata?.gate,
  };
}

const SCORE_FIELDS: Array<{ key: keyof RuleScores; label: string }> = [
  { key: 'toxicityScore', label: 'Toxicity' },
  { key: 'nsfwScore', label: 'NSFW' },
  { key: 'spamScore', label: 'Spam' },
  { key: 'violenceScore', label: 'Violence' },
  { key: 'hateSpeechScore', label: 'Hate speech' },
  { key: 'sentimentScore', label: 'Sentiment' },
];

function RuleTester({ ruleId }: { ruleId: string }) {
  const [contentType, setContentType] = useState('text');
  const [contentText, setContentText] = useState('');
  const [sourceService, setSourceService] = useState('');
  const [authorDid, setAuthorDid] = useState('');
  const [riskScore, setRiskScore] = useState<number | ''>('');
  const [scores, setScores] = useState<RuleScores>({});

  const test = useMutation({
    mutationFn: () =>
      moderatorAdminApi.testRule(ruleId, {
        contentType,
        contentText,
        sourceService: sourceService || undefined,
        authorDid: authorDid || undefined,
        riskScore: riskScore === '' ? undefined : Number(riskScore),
        scores,
      }),
  });

  const result = test.data?.test;
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <TextField select size="small" label="Content type" value={contentType} onChange={(e) => setContentType(e.target.value)} sx={{ minWidth: 140 }}>
          {CONTENT_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Source service" value={sourceService} onChange={(e) => setSourceService(e.target.value)} />
        <TextField size="small" label="Author DID" value={authorDid} onChange={(e) => setAuthorDid(e.target.value)} sx={{ minWidth: 200 }} />
      </Stack>
      <TextField size="small" multiline minRows={2} label="Content text" value={contentText} onChange={(e) => setContentText(e.target.value)} />
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          type="number"
          label="Risk score"
          value={riskScore}
          onChange={(e) => setRiskScore(e.target.value === '' ? '' : Number(e.target.value))}
          sx={{ width: 130 }}
        />
        {SCORE_FIELDS.map((f) => (
          <TextField
            key={f.key}
            size="small"
            type="number"
            label={f.label}
            value={scores[f.key] ?? ''}
            onChange={(e) => setScores((s) => ({ ...s, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) }))}
            sx={{ width: 130 }}
          />
        ))}
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center">
        <Button variant="outlined" onClick={() => test.mutate()} disabled={test.isPending}>Run test</Button>
        {result && (
          <>
            <Chip size="small" color={result.matched ? 'success' : 'default'} label={result.matched ? 'matched' : 'no match'} />
            <Chip size="small" color={result.wouldWin ? 'success' : 'default'} variant="outlined" label={result.wouldWin ? 'would win' : 'would not win'} />
          </>
        )}
        {test.isError && <Typography variant="caption" color="error">{(test.error as Error).message}</Typography>}
      </Stack>
      {result?.pipeline != null && (
        <Box component="pre" sx={{ m: 0, p: 1, bgcolor: 'grey.100', borderRadius: 1, fontSize: 11, overflow: 'auto', maxHeight: 200 }}>
          {JSON.stringify(result.pipeline, null, 2)}
        </Box>
      )}
    </Stack>
  );
}

export function RuleBuilderDialog({
  open,
  rule,
  allRules,
  onClose,
  onDone,
}: {
  open: boolean;
  rule?: Rule | null;
  allRules: Array<{ id: string; name?: string }>;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => ruleToForm(rule));
  const [root, setRoot] = useState<EditorNode>(() => nodeFromCondition(rule?.conditions) ?? newGroup('all'));
  const [useRaw, setUseRaw] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);
  // Id of the persisted rule available for testing (edit target, or freshly created).
  const [savedId, setSavedId] = useState<string | null>(rule?.id ?? null);

  useEffect(() => {
    if (!open) return;
    setForm(ruleToForm(rule));
    setRoot(nodeFromCondition(rule?.conditions));
    setSavedId(rule?.id ?? null);
    setUseRaw(false);
    setRawError(null);
  }, [open, rule]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  /** Resolve the conditions object from either the tree builder or raw JSON. */
  const resolveConditions = (): { ok: true; value: RuleInput['conditions'] } | { ok: false } => {
    if (useRaw) {
      try {
        const parsed = JSON.parse(rawText || '{}');
        return { ok: true, value: parsed };
      } catch {
        setRawError('Conditions is not valid JSON.');
        return { ok: false };
      }
    }
    return { ok: true, value: nodeToCondition(root) };
  };

  const toggleRaw = () => {
    if (!useRaw) {
      setRawText(JSON.stringify(nodeToCondition(root), null, 2));
      setUseRaw(true);
    } else {
      try {
        const parsed = JSON.parse(rawText || '{}');
        setRoot(nodeFromCondition(parsed));
        setRawError(null);
        setUseRaw(false);
      } catch {
        setRawError('Fix the JSON before switching back to the builder.');
      }
    }
  };

  const buildBody = (): RuleInput | null => {
    const cond = resolveConditions();
    if (!cond.ok) return null;
    return {
      name: form.name,
      description: form.description,
      action: form.action,
      priority: Number(form.priority) || 0,
      enabled: form.enabled,
      appliesTo: form.appliesTo,
      sourceServices: form.sourceServices,
      parentRuleId: form.parentRuleId || null,
      thresholdScore: form.thresholdScore === '' ? null : Number(form.thresholdScore),
      conditions: cond.value,
      metadata: { safeguard: form.safeguard, gate: form.gate },
    };
  };

  const save = useMutation({
    mutationFn: (body: RuleInput) =>
      savedId ? moderatorAdminApi.updateRule(savedId, body) : moderatorAdminApi.createRule(body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['mod', 'rules'] });
      const id = res?.rule?.id;
      if (id) setSavedId(id);
      onDone(savedId ? 'Rule updated' : 'Rule created');
    },
    onError: (e) => onDone((e as Error).message),
  });

  const submit = () => {
    const body = buildBody();
    if (!body) return;
    save.mutate(body);
  };

  const parentOptions = useMemo(() => allRules.filter((r) => r.id !== rule?.id), [allRules, rule?.id]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{rule ? 'Edit rule' : 'New rule'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField label="Name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
          <TextField label="Description" multiline minRows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />

          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <TextField select label="Action" value={form.action} onChange={(e) => set('action', e.target.value as RuleAction)} sx={{ minWidth: 180 }}>
              {ACTIONS.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
            </TextField>
            <TextField label="Priority" type="number" value={form.priority} onChange={(e) => set('priority', Number(e.target.value))} sx={{ width: 130 }} />
            <TextField
              label="Threshold score"
              type="number"
              value={form.thresholdScore}
              onChange={(e) => set('thresholdScore', e.target.value === '' ? '' : Number(e.target.value))}
              sx={{ width: 160 }}
              helperText="optional"
            />
            <FormControlLabel control={<Switch checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />} label="Enabled" />
          </Stack>

          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
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
            <TextField
              select
              label="Parent rule (chaining)"
              value={form.parentRuleId}
              onChange={(e) => set('parentRuleId', e.target.value)}
              sx={{ minWidth: 240 }}
            >
              <MenuItem value="">(none)</MenuItem>
              {parentOptions.map((r) => <MenuItem key={r.id} value={r.id}>{r.name || r.id.slice(0, 8)}</MenuItem>)}
            </TextField>
          </Stack>

          <Autocomplete
            multiple
            freeSolo
            options={SERVICE_SUGGESTIONS}
            value={form.sourceServices}
            onChange={(_e, v) => set('sourceServices', v as string[])}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => <Chip size="small" label={option} {...getTagProps({ index })} key={option} />)
            }
            renderInput={(params) => <TextField {...params} label="Source services" placeholder="add service…" />}
          />

          <Stack direction="row" spacing={2}>
            <FormControlLabel control={<Switch checked={form.safeguard} onChange={(e) => set('safeguard', e.target.checked)} />} label="Safeguard" />
            <FormControlLabel control={<Switch checked={form.gate} onChange={(e) => set('gate', e.target.checked)} />} label="Gate" />
          </Stack>

          <Divider />

          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle1" fontWeight={600}>Conditions</Typography>
            <Button size="small" onClick={toggleRaw}>{useRaw ? 'Visual builder' : 'Edit as JSON'}</Button>
          </Stack>
          {rawError && <Alert severity="error">{rawError}</Alert>}
          {useRaw ? (
            <TextField
              multiline
              minRows={8}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
            />
          ) : (
            <ConditionTree node={root} onChange={setRoot} />
          )}

          <Divider />

          <Box>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Test rule</Typography>
            {savedId ? (
              <RuleTester ruleId={savedId} />
            ) : (
              <Alert severity="info">Save the rule first to enable testing against sample content.</Alert>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={!form.name || save.isPending} onClick={submit}>
          {savedId ? 'Save changes' : 'Create rule'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
