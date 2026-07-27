/**
 * Structured create/edit form for a guardrail spec — typed rule rows (the type
 * select switches each row's fields) and a test-case list. "Edit as JSON" is a
 * secondary escape hatch only. Save keeps the spec's current enabled flag;
 * saving an ENABLED guardrail whose tests now fail is refused 400 with the
 * report, which we surface inline.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  FormGroup,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  type GuardrailRule,
  type GuardrailScope,
  type GuardrailSpec,
  type RuleType,
} from '@/api/cortex';
import { cortexAdminApi, testReportFromError } from '@/api/admin/cortex';
import { toMessage } from '@/lib/errors';
import { KNOWN_CHANNELS, type ToastFn } from './common';

const RULE_TYPES: RuleType[] = ['regex', 'contains', 'max_length', 'llm_judge'];
const SCOPES: GuardrailScope[] = ['input', 'output', 'tool_call'];
const ACTIONS = ['warn', 'escalate', 'block'] as const;

interface RuleDraft {
  type: RuleType;
  pattern: string;
  description: string;
  /** comma-separated for the `contains` type */
  values: string;
  case_sensitive: boolean;
  limit: number | '';
  prompt: string;
  fail_marker: string;
}

interface TestDraft {
  text: string;
  expect: 'trigger' | 'pass';
}

function blankRule(): RuleDraft {
  return { type: 'regex', pattern: '', description: '', values: '', case_sensitive: false, limit: '', prompt: '', fail_marker: '' };
}

function ruleToDraft(r: GuardrailRule): RuleDraft {
  return {
    type: r.type,
    pattern: r.pattern ?? '',
    description: r.description ?? '',
    values: (r.values ?? []).join(', '),
    case_sensitive: !!r.case_sensitive,
    limit: typeof r.limit === 'number' ? r.limit : '',
    prompt: r.prompt ?? '',
    fail_marker: r.fail_marker ?? '',
  };
}

function draftToRule(d: RuleDraft): GuardrailRule {
  switch (d.type) {
    case 'regex':
      return { type: 'regex', pattern: d.pattern, ...(d.description.trim() && { description: d.description.trim() }) };
    case 'contains':
      return {
        type: 'contains',
        values: d.values.split(',').map((s) => s.trim()).filter(Boolean),
        case_sensitive: d.case_sensitive,
      };
    case 'max_length':
      return { type: 'max_length', limit: d.limit === '' ? 0 : Number(d.limit) };
    case 'llm_judge':
      return { type: 'llm_judge', prompt: d.prompt, ...(d.fail_marker.trim() && { fail_marker: d.fail_marker.trim() }) };
  }
}

function RuleRow({ rule, onChange, onDelete }: { rule: RuleDraft; onChange: (r: RuleDraft) => void; onDelete: () => void }) {
  const set = <K extends keyof RuleDraft>(k: K, v: RuleDraft[K]) => onChange({ ...rule, [k]: v });
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField select size="small" label="Rule type" value={rule.type} onChange={(e) => set('type', e.target.value as RuleType)} sx={{ minWidth: 160 }}>
            {RULE_TYPES.map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </TextField>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Remove rule">
            <IconButton aria-label="Remove rule" size="small" color="error" onClick={onDelete}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        {rule.type === 'regex' && (
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Pattern" required value={rule.pattern} onChange={(e) => set('pattern', e.target.value)} sx={{ flex: 2 }} inputProps={{ style: { fontFamily: 'monospace' } }} />
            <TextField size="small" label="Description" value={rule.description} onChange={(e) => set('description', e.target.value)} sx={{ flex: 3 }} />
          </Stack>
        )}
        {rule.type === 'contains' && (
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField size="small" label="Values" required value={rule.values} onChange={(e) => set('values', e.target.value)} sx={{ flex: 1 }} helperText="comma-separated" />
            <FormControlLabel control={<Switch size="small" checked={rule.case_sensitive} onChange={(e) => set('case_sensitive', e.target.checked)} />} label="Case sensitive" />
          </Stack>
        )}
        {rule.type === 'max_length' && (
          <TextField
            size="small"
            type="number"
            label="Max length (characters)"
            required
            value={rule.limit}
            onChange={(e) => set('limit', e.target.value === '' ? '' : Number(e.target.value))}
            sx={{ maxWidth: 240 }}
          />
        )}
        {rule.type === 'llm_judge' && (
          <Stack spacing={1}>
            <TextField size="small" label="Judge prompt" required multiline minRows={2} value={rule.prompt} onChange={(e) => set('prompt', e.target.value)} />
            <TextField size="small" label="Fail marker" value={rule.fail_marker} onChange={(e) => set('fail_marker', e.target.value)} helperText="substring in the judge's answer that marks a failure (optional)" sx={{ maxWidth: 320 }} />
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

export function GuardrailDialog({
  open,
  spec,
  onClose,
  toast,
}: {
  open: boolean;
  /** null = create a new guardrail */
  spec: GuardrailSpec | null;
  onClose: () => void;
  toast: ToastFn;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [action, setAction] = useState<(typeof ACTIONS)[number]>('warn');
  const [scope, setScope] = useState<GuardrailScope[]>(['output']);
  const [channels, setChannels] = useState<string[]>([]);
  const [rules, setRules] = useState<RuleDraft[]>([blankRule()]);
  const [tests, setTests] = useState<TestDraft[]>([]);
  const [useRaw, setUseRaw] = useState(false);
  const [rawText, setRawText] = useState('');
  const [inlineError, setInlineError] = useState<{ message: string; failing?: string[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(spec?.name ?? '');
    setDescription(spec?.description ?? '');
    setAction(spec?.action ?? 'warn');
    setScope(spec?.scope ?? ['output']);
    setChannels(spec?.channels ?? []);
    setRules(spec?.rules?.length ? spec.rules.map(ruleToDraft) : [blankRule()]);
    setTests((spec?.tests ?? []).map((t) => ({ text: t.text, expect: t.expect })));
    setUseRaw(false);
    setRawText('');
    setInlineError(null);
  }, [open, spec]);

  const buildSpec = (): GuardrailSpec => ({
    name: name.trim(),
    description: description.trim(),
    enabled: spec?.enabled ?? false,
    scope,
    channels: channels.length ? channels : null,
    action,
    rules: rules.map(draftToRule),
    tests: tests.filter((t) => t.text.trim()).map((t) => ({ text: t.text, expect: t.expect })),
  });

  /** Spec from the active mode — raw JSON must parse before it can be saved. */
  const resolveSpec = (): GuardrailSpec | null => {
    if (!useRaw) return buildSpec();
    try {
      return JSON.parse(rawText || '{}') as GuardrailSpec;
    } catch {
      setInlineError({ message: 'The JSON is not valid — fix it before saving.' });
      return null;
    }
  };

  const toggleRaw = () => {
    if (!useRaw) {
      setRawText(JSON.stringify(buildSpec(), null, 2));
      setUseRaw(true);
      return;
    }
    try {
      const parsed = JSON.parse(rawText || '{}') as GuardrailSpec;
      setName(parsed.name ?? '');
      setDescription(parsed.description ?? '');
      setAction((parsed.action as (typeof ACTIONS)[number]) ?? 'warn');
      setScope(parsed.scope ?? []);
      setChannels(parsed.channels ?? []);
      setRules((parsed.rules ?? []).map(ruleToDraft));
      setTests((parsed.tests ?? []).map((t) => ({ text: t.text, expect: t.expect })));
      setInlineError(null);
      setUseRaw(false);
    } catch {
      setInlineError({ message: 'Fix the JSON before switching back to the form.' });
    }
  };

  const save = useMutation({
    mutationFn: (body: GuardrailSpec) => cortexAdminApi.saveGuardrail(body),
    onSuccess: (r) => {
      toast(`Guardrail saved: ${r.saved}`, 'success');
      qc.invalidateQueries({ queryKey: ['cortex-admin', 'guardrails'] });
      onClose();
    },
    onError: (e) => {
      const report = testReportFromError(e);
      setInlineError({
        message: toMessage(e),
        failing: report?.results
          .filter((c) => !c.ok)
          .map((c) => ('text' in c ? c.text : JSON.stringify((c as { args: unknown }).args))),
      });
    },
  });

  const submit = () => {
    setInlineError(null);
    const body = resolveSpec();
    if (body) save.mutate(body);
  };

  const toggleScope = (s: GuardrailScope) =>
    setScope((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const canSave = useRaw ? rawText.trim() !== '' : name.trim() !== '' && scope.length > 0 && rules.length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{spec ? `Edit guardrail — ${spec.name}` : 'New guardrail'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {inlineError && (
            <Alert severity="error">
              {inlineError.message}
              {inlineError.failing && inlineError.failing.length > 0 && (
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {inlineError.failing.map((t, i) => (
                    <li key={i}>
                      <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {t}
                      </Typography>
                    </li>
                  ))}
                </Box>
              )}
            </Alert>
          )}

          {useRaw ? (
            <TextField
              label="Guardrail spec (JSON)"
              multiline
              minRows={16}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
            />
          ) : (
            <>
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!!spec}
                  helperText={spec ? 'names are immutable' : 'lowercase identifier'}
                  sx={{ flex: 1 }}
                />
                <TextField select label="Action" value={action} onChange={(e) => setAction(e.target.value as (typeof ACTIONS)[number])} sx={{ minWidth: 160 }}>
                  {ACTIONS.map((a) => (
                    <MenuItem key={a} value={a}>{a}</MenuItem>
                  ))}
                </TextField>
              </Stack>
              <TextField label="Description" multiline minRows={2} value={description} onChange={(e) => setDescription(e.target.value)} />

              <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap alignItems="flex-start">
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Scope</Typography>
                  <FormGroup row>
                    {SCOPES.map((s) => (
                      <FormControlLabel
                        key={s}
                        control={<Checkbox size="small" checked={scope.includes(s)} onChange={() => toggleScope(s)} />}
                        label={s}
                      />
                    ))}
                  </FormGroup>
                </Box>
                <TextField
                  select
                  label="Channels"
                  value={channels}
                  onChange={(e) => setChannels(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                  SelectProps={{
                    multiple: true,
                    renderValue: (v) => {
                      const arr = v as string[];
                      return arr.length ? (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {arr.map((c) => <Chip key={c} size="small" label={c} />)}
                        </Stack>
                      ) : 'all';
                    },
                  }}
                  helperText="empty = all channels"
                  sx={{ minWidth: 260 }}
                >
                  {KNOWN_CHANNELS.map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </TextField>
              </Stack>

              <Divider />
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="subtitle1" fontWeight={600}>Rules</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setRules((r) => [...r, blankRule()])}>
                  Add rule
                </Button>
              </Stack>
              {rules.length === 0 && <Alert severity="info">Add at least one rule.</Alert>}
              {rules.map((r, i) => (
                <RuleRow
                  key={i}
                  rule={r}
                  onChange={(next) => setRules((cur) => cur.map((x, j) => (j === i ? next : x)))}
                  onDelete={() => setRules((cur) => cur.filter((_x, j) => j !== i))}
                />
              ))}

              <Divider />
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>Tests</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Enabling requires the whole suite to pass — "trigger" texts must trip the rules, "pass" texts must not.
                  </Typography>
                </Box>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setTests((t) => [...t, { text: '', expect: 'trigger' }])}>
                  Add test
                </Button>
              </Stack>
              {tests.map((t, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    label="Test text"
                    value={t.text}
                    onChange={(e) => setTests((cur) => cur.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    select
                    size="small"
                    label="Expect"
                    value={t.expect}
                    onChange={(e) => setTests((cur) => cur.map((x, j) => (j === i ? { ...x, expect: e.target.value as 'trigger' | 'pass' } : x)))}
                    sx={{ minWidth: 120 }}
                  >
                    <MenuItem value="trigger">trigger</MenuItem>
                    <MenuItem value="pass">pass</MenuItem>
                  </TextField>
                  <IconButton size="small" color="error" aria-label="Remove test" onClick={() => setTests((cur) => cur.filter((_x, j) => j !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={toggleRaw} sx={{ mr: 'auto' }}>
          {useRaw ? 'Form view' : 'Edit as JSON'}
        </Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!canSave || save.isPending} onClick={submit}>
          {spec ? 'Save changes' : 'Create guardrail'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
