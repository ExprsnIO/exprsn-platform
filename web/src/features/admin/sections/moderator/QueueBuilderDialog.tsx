/**
 * Create/edit dialog for a moderation queue. The `match` rule reuses ConditionTree
 * (the same nested condition builder as the rule builder) to decide which items
 * route into the queue. RabbitMQ-only fields are shown when backend === 'rabbitmq'.
 * A Test button evaluates the match against a sample scores form.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
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
  type QueueBackend,
  type QueuePriority,
  type QueueSpec,
  type RuleScores,
} from '@/api/admin/moderator';
import {
  ConditionTree,
  newGroup,
  nodeFromCondition,
  nodeToCondition,
  type EditorNode,
} from './ConditionTree';

const BACKENDS: QueueBackend[] = ['redis', 'rabbitmq'];
const PRIORITIES: QueuePriority[] = ['low', 'normal', 'high', 'urgent'];
const EXCHANGE_TYPES = ['topic', 'direct', 'fanout'] as const;
const CONTENT_TYPES: ContentType[] = ['text', 'image', 'video', 'audio', 'post', 'comment', 'message', 'profile', 'file'];
const NAME_RE = /^[a-z0-9_]+$/;

interface QueueForm {
  name: string;
  displayName: string;
  description: string;
  backend: QueueBackend;
  enabled: boolean;
  priority: QueuePriority;
  concurrency: number;
  attempts: number;
  backoffType: 'exponential' | 'fixed';
  backoffDelay: number;
  deadLetter: boolean;
  rateLimitOn: boolean;
  rateMax: number;
  rateDuration: number;
  // rabbit
  exchange: string;
  exchangeType: 'topic' | 'direct' | 'fanout';
  routingKey: string;
  durable: boolean;
  dlx: string;
}

function toForm(qd?: QueueSpec | null): QueueForm {
  return {
    name: qd?.name ?? '',
    displayName: qd?.displayName ?? '',
    description: qd?.description ?? '',
    backend: qd?.backend ?? 'redis',
    enabled: qd?.enabled ?? true,
    priority: qd?.priority ?? 'normal',
    concurrency: qd?.concurrency ?? 1,
    attempts: qd?.attempts ?? 3,
    backoffType: qd?.backoff?.type ?? 'exponential',
    backoffDelay: qd?.backoff?.delay ?? 1000,
    deadLetter: qd?.deadLetter ?? false,
    rateLimitOn: !!qd?.rateLimit,
    rateMax: qd?.rateLimit?.max ?? 100,
    rateDuration: qd?.rateLimit?.duration ?? 1000,
    exchange: qd?.rabbit?.exchange ?? '',
    exchangeType: qd?.rabbit?.exchangeType ?? 'topic',
    routingKey: qd?.rabbit?.routingKey ?? '',
    durable: qd?.rabbit?.durable ?? true,
    dlx: qd?.rabbit?.dlx ?? '',
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

function QueueTester({ name }: { name: string }) {
  const [contentType, setContentType] = useState('text');
  const [contentText, setContentText] = useState('');
  const [sourceService, setSourceService] = useState('');
  const [authorDid, setAuthorDid] = useState('');
  const [scores, setScores] = useState<RuleScores>({});

  const test = useMutation({
    mutationFn: () =>
      moderatorAdminApi.testQueue(name, {
        scores,
        contentType,
        sourceService: sourceService || undefined,
        contentText: contentText || undefined,
        authorDid: authorDid || undefined,
      }),
  });

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <TextField select size="small" label="Content type" value={contentType} onChange={(e) => setContentType(e.target.value)} sx={{ minWidth: 140 }}>
          {CONTENT_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Source service" value={sourceService} onChange={(e) => setSourceService(e.target.value)} />
        <TextField size="small" label="Author DID" value={authorDid} onChange={(e) => setAuthorDid(e.target.value)} sx={{ minWidth: 180 }} />
      </Stack>
      <TextField size="small" multiline minRows={2} label="Content text" value={contentText} onChange={(e) => setContentText(e.target.value)} />
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
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
        {test.data && (
          <Chip size="small" color={test.data.matched ? 'success' : 'default'} label={test.data.matched ? 'matched' : 'no match'} />
        )}
        {test.isError && <Typography variant="caption" color="error">{(test.error as Error).message}</Typography>}
      </Stack>
    </Stack>
  );
}

export function QueueBuilderDialog({
  open,
  queue,
  onClose,
  onDone,
}: {
  open: boolean;
  queue?: QueueSpec | null;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!queue;
  const [form, setForm] = useState<QueueForm>(() => toForm(queue));
  const [root, setRoot] = useState<EditorNode>(() => nodeFromCondition(queue?.match) ?? newGroup('all'));
  const [useRaw, setUseRaw] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);
  // Name of a persisted queue available for testing (edit target, or freshly saved).
  const [savedName, setSavedName] = useState<string | null>(queue?.name ?? null);

  useEffect(() => {
    if (!open) return;
    setForm(toForm(queue));
    setRoot(nodeFromCondition(queue?.match));
    setSavedName(queue?.name ?? null);
    setUseRaw(false);
    setRawText('');
    setRawError(null);
  }, [open, queue]);

  const set = <K extends keyof QueueForm>(k: K, v: QueueForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const resolveMatch = (): { ok: true; value: QueueSpec['match'] } | { ok: false } => {
    if (useRaw) {
      try {
        return { ok: true, value: JSON.parse(rawText || '{}') };
      } catch {
        setRawError('Match is not valid JSON.');
        return { ok: false };
      }
    }
    return { ok: true, value: nodeToCondition(root) };
  };

  const toggleRaw = () => {
    if (!useRaw) {
      setRawText(JSON.stringify(nodeToCondition(root), null, 2));
      setRawError(null);
      setUseRaw(true);
    } else {
      try {
        setRoot(nodeFromCondition(JSON.parse(rawText || '{}')));
        setRawError(null);
        setUseRaw(false);
      } catch {
        setRawError('Fix the JSON before switching back to the builder.');
      }
    }
  };

  const nameError = !NAME_RE.test(form.name) ? 'Lowercase letters, digits and underscore only.' : null;

  const save = useMutation({
    mutationFn: (spec: QueueSpec) => moderatorAdminApi.saveQueue(spec.name, spec),
    onSuccess: (_res, spec) => {
      qc.invalidateQueries({ queryKey: ['mod', 'queues'] });
      setSavedName(spec.name);
      onDone(isEdit ? 'Queue updated' : 'Queue created');
    },
    onError: (e) => onDone((e as Error).message),
  });

  const submit = () => {
    if (nameError) return;
    const match = resolveMatch();
    if (!match.ok) return;
    const spec: QueueSpec = {
      name: form.name,
      displayName: form.displayName,
      description: form.description,
      backend: form.backend,
      enabled: form.enabled,
      priority: form.priority,
      concurrency: Number(form.concurrency) || 1,
      attempts: Number(form.attempts) || 1,
      backoff: { type: form.backoffType, delay: Number(form.backoffDelay) || 0 },
      deadLetter: form.deadLetter,
      rateLimit: form.rateLimitOn ? { max: Number(form.rateMax) || 0, duration: Number(form.rateDuration) || 0 } : null,
      rabbit:
        form.backend === 'rabbitmq'
          ? {
              exchange: form.exchange,
              exchangeType: form.exchangeType,
              routingKey: form.routingKey,
              durable: form.durable,
              dlx: form.dlx,
            }
          : null,
      match: match.value ?? {},
    };
    save.mutate(spec);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{isEdit ? 'Edit queue' : 'New queue'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <TextField
              label="Name"
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              disabled={isEdit}
              error={!!form.name && !!nameError}
              helperText={isEdit ? 'Locked on edit' : (nameError ?? 'e.g. high_risk_text')}
              sx={{ minWidth: 220 }}
            />
            <TextField label="Display name" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} sx={{ minWidth: 220 }} />
          </Stack>
          <TextField label="Description" multiline minRows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />

          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
            <TextField select label="Backend" value={form.backend} onChange={(e) => set('backend', e.target.value as QueueBackend)} sx={{ minWidth: 150 }}>
              {BACKENDS.map((b) => <MenuItem key={b} value={b}>{b}</MenuItem>)}
            </TextField>
            <TextField select label="Priority" value={form.priority} onChange={(e) => set('priority', e.target.value as QueuePriority)} sx={{ minWidth: 150 }}>
              {PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </TextField>
            <TextField label="Concurrency" type="number" value={form.concurrency} onChange={(e) => set('concurrency', Number(e.target.value))} sx={{ width: 140 }} />
            <TextField label="Attempts" type="number" value={form.attempts} onChange={(e) => set('attempts', Number(e.target.value))} sx={{ width: 130 }} />
            <FormControlLabel control={<Switch checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />} label="Enabled" />
          </Stack>

          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
            <TextField select label="Backoff" value={form.backoffType} onChange={(e) => set('backoffType', e.target.value as 'exponential' | 'fixed')} sx={{ minWidth: 160 }}>
              <MenuItem value="exponential">exponential</MenuItem>
              <MenuItem value="fixed">fixed</MenuItem>
            </TextField>
            <TextField label="Backoff delay (ms)" type="number" value={form.backoffDelay} onChange={(e) => set('backoffDelay', Number(e.target.value))} sx={{ width: 180 }} />
            <FormControlLabel control={<Switch checked={form.deadLetter} onChange={(e) => set('deadLetter', e.target.checked)} />} label="Dead-letter" />
          </Stack>

          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
            <FormControlLabel control={<Switch checked={form.rateLimitOn} onChange={(e) => set('rateLimitOn', e.target.checked)} />} label="Rate limit" />
            {form.rateLimitOn && (
              <>
                <TextField label="Max" type="number" value={form.rateMax} onChange={(e) => set('rateMax', Number(e.target.value))} sx={{ width: 130 }} />
                <TextField label="Duration (ms)" type="number" value={form.rateDuration} onChange={(e) => set('rateDuration', Number(e.target.value))} sx={{ width: 160 }} />
              </>
            )}
          </Stack>

          {form.backend === 'rabbitmq' && (
            <Box sx={{ p: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>RabbitMQ</Typography>
              <Alert severity="info" sx={{ mb: 1.5 }}>Spec saved; live wiring is a follow-up.</Alert>
              <Stack spacing={2}>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <TextField label="Exchange" value={form.exchange} onChange={(e) => set('exchange', e.target.value)} sx={{ minWidth: 200 }} />
                  <TextField select label="Exchange type" value={form.exchangeType} onChange={(e) => set('exchangeType', e.target.value as 'topic' | 'direct' | 'fanout')} sx={{ minWidth: 160 }}>
                    {EXCHANGE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </TextField>
                  <TextField label="Routing key" value={form.routingKey} onChange={(e) => set('routingKey', e.target.value)} sx={{ minWidth: 200 }} />
                </Stack>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
                  <TextField label="Dead-letter exchange (dlx)" value={form.dlx} onChange={(e) => set('dlx', e.target.value)} sx={{ minWidth: 260 }} />
                  <FormControlLabel control={<Switch checked={form.durable} onChange={(e) => set('durable', e.target.checked)} />} label="Durable" />
                </Stack>
              </Stack>
            </Box>
          )}

          <Divider />

          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle1" fontWeight={600}>Match (routes here)</Typography>
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
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Test routing</Typography>
            {savedName ? (
              <QueueTester name={savedName} />
            ) : (
              <Alert severity="info">Save the queue first to test sample content against its match rule.</Alert>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={!form.name || !!nameError || save.isPending} onClick={submit}>
          {isEdit ? 'Save changes' : 'Create queue'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
