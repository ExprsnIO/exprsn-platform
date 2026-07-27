/**
 * Structured create/edit form for a tool spec: a typed parameter list that
 * builds the JSON-schema `parameters` object, kind-switched editors (python
 * code / http request), and a test editor whose arg inputs follow the declared
 * parameters. "Edit as JSON" is a secondary escape hatch only.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { type ToolKind, type ToolSpec, type ToolTest } from '@/api/cortex';
import { cortexAdminApi, testReportFromError } from '@/api/admin/cortex';
import { toMessage } from '@/lib/errors';
import { type ToastFn } from './common';

const PARAM_TYPES = ['string', 'number', 'integer', 'boolean'] as const;
type ParamType = (typeof PARAM_TYPES)[number];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const EXPECT_MODES = [
  { value: 'expect_contains', label: 'output contains' },
  { value: 'expect_regex', label: 'output matches regex' },
  { value: 'expect_error', label: 'expects an error' },
] as const;
type ExpectMode = (typeof EXPECT_MODES)[number]['value'];

interface ParamDraft {
  name: string;
  type: ParamType;
  description: string;
  required: boolean;
}

interface HeaderDraft {
  key: string;
  value: string;
}

interface TestDraft {
  args: Record<string, string | boolean>;
  mode: ExpectMode;
  value: string;
}

function specToParams(spec: ToolSpec | null): ParamDraft[] {
  if (!spec) return [];
  const required = spec.parameters?.required ?? [];
  return Object.entries(spec.parameters?.properties ?? {}).map(([n, p]) => ({
    name: n,
    type: (PARAM_TYPES as readonly string[]).includes(p.type ?? '') ? (p.type as ParamType) : 'string',
    description: p.description ?? '',
    required: required.includes(n),
  }));
}

function specToTests(spec: ToolSpec | null): TestDraft[] {
  return (spec?.tests ?? []).map((t) => {
    const args: Record<string, string | boolean> = {};
    for (const [k, v] of Object.entries(t.args ?? {})) args[k] = typeof v === 'boolean' ? v : String(v);
    const mode: ExpectMode = t.expect_error ? 'expect_error' : t.expect_regex != null ? 'expect_regex' : 'expect_contains';
    return { args, mode, value: t.expect_contains ?? t.expect_regex ?? '' };
  });
}

/** Coerce a form value to the declared parameter type; undefined = omit. */
function coerceArg(type: ParamType, v: string | boolean | undefined): unknown {
  if (type === 'boolean') return !!v;
  const s = typeof v === 'string' ? v : '';
  if (s === '') return undefined;
  if (type === 'number' || type === 'integer') {
    const n = Number(s);
    return Number.isNaN(n) ? s : n;
  }
  return s;
}

/** One typed input per declared parameter (shared by the test rows). */
export function ArgInputs({
  params,
  args,
  onChange,
  size = 'small',
}: {
  params: Array<{ name: string; type: string; required?: boolean; description?: string }>;
  args: Record<string, string | boolean>;
  onChange: (name: string, v: string | boolean) => void;
  size?: 'small' | 'medium';
}) {
  if (!params.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        This tool declares no parameters.
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
      {params.map((p) =>
        p.type === 'boolean' ? (
          <FormControlLabel
            key={p.name}
            control={<Switch size="small" checked={!!args[p.name]} onChange={(e) => onChange(p.name, e.target.checked)} />}
            label={p.name}
          />
        ) : (
          <TextField
            key={p.name}
            size={size}
            type={p.type === 'number' || p.type === 'integer' ? 'number' : 'text'}
            label={p.name}
            required={!!p.required}
            helperText={p.description || undefined}
            value={typeof args[p.name] === 'string' ? args[p.name] : ''}
            onChange={(e) => onChange(p.name, e.target.value)}
            sx={{ minWidth: 180 }}
          />
        ),
      )}
    </Stack>
  );
}

export function ToolDialog({
  open,
  spec,
  onClose,
  toast,
}: {
  open: boolean;
  /** null = create a new tool */
  spec: ToolSpec | null;
  onClose: () => void;
  toast: ToastFn;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<ToolKind>('http');
  const [timeout_, setTimeout_] = useState<number | ''>(30);
  const [params, setParams] = useState<ParamDraft[]>([]);
  const [code, setCode] = useState('');
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<HeaderDraft[]>([]);
  const [bodyText, setBodyText] = useState('');
  const [tests, setTests] = useState<TestDraft[]>([]);
  const [useRaw, setUseRaw] = useState(false);
  const [rawText, setRawText] = useState('');
  const [inlineError, setInlineError] = useState<{ message: string; failing?: string[] } | null>(null);

  const hydrate = (s: ToolSpec | null) => {
    setName(s?.name ?? '');
    setDescription(s?.description ?? '');
    setKind(s?.kind ?? 'http');
    setTimeout_(typeof s?.timeout === 'number' ? s.timeout : 30);
    setParams(specToParams(s));
    setCode(s?.code ?? 'def run(args):\n    return ""\n');
    setMethod(s?.request?.method?.toUpperCase() ?? 'GET');
    setUrl(s?.request?.url ?? '');
    setHeaders(Object.entries(s?.request?.headers ?? {}).map(([key, value]) => ({ key, value })));
    setBodyText(
      s?.request?.body == null ? '' : typeof s.request.body === 'string' ? s.request.body : JSON.stringify(s.request.body, null, 2),
    );
    setTests(specToTests(s));
  };

  useEffect(() => {
    if (!open) return;
    hydrate(spec);
    setUseRaw(false);
    setRawText('');
    setInlineError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, spec]);

  const buildSpec = (): ToolSpec => {
    const declared = params.filter((p) => p.name.trim());
    const required = declared.filter((p) => p.required).map((p) => p.name.trim());
    const out: ToolSpec = {
      name: name.trim(),
      description: description.trim(),
      enabled: spec?.enabled ?? false,
      kind,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          declared.map((p) => [p.name.trim(), { type: p.type, ...(p.description.trim() && { description: p.description.trim() }) }]),
        ),
        ...(required.length ? { required } : {}),
      },
      timeout: timeout_ === '' ? 30 : Number(timeout_),
      tests: tests.map((t): ToolTest => {
        const args: Record<string, unknown> = {};
        for (const p of declared) {
          const v = coerceArg(p.type, t.args[p.name]);
          if (v !== undefined) args[p.name] = v;
        }
        if (t.mode === 'expect_error') return { args, expect_error: true };
        if (t.mode === 'expect_regex') return { args, expect_regex: t.value };
        return { args, expect_contains: t.value };
      }),
    };
    if (kind === 'python') {
      out.code = code;
    } else {
      let body: unknown;
      const raw = bodyText.trim();
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      out.request = {
        method,
        url: url.trim(),
        ...(headers.some((h) => h.key.trim())
          ? { headers: Object.fromEntries(headers.filter((h) => h.key.trim()).map((h) => [h.key.trim(), h.value])) }
          : {}),
        ...(body !== undefined ? { body } : {}),
      };
    }
    return out;
  };

  const resolveSpec = (): ToolSpec | null => {
    if (!useRaw) return buildSpec();
    try {
      return JSON.parse(rawText || '{}') as ToolSpec;
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
      hydrate(JSON.parse(rawText || '{}') as ToolSpec);
      setInlineError(null);
      setUseRaw(false);
    } catch {
      setInlineError({ message: 'Fix the JSON before switching back to the form.' });
    }
  };

  const save = useMutation({
    mutationFn: (body: ToolSpec) => cortexAdminApi.saveTool(body),
    onSuccess: (r) => {
      toast(`Tool saved: ${r.saved}`, 'success');
      qc.invalidateQueries({ queryKey: ['cortex-admin', 'tools'] });
      onClose();
    },
    onError: (e) => {
      const report = testReportFromError(e);
      setInlineError({
        message: toMessage(e),
        failing: report?.results.filter((c) => !c.ok).map((c) => JSON.stringify((c as { args?: unknown }).args ?? c)),
      });
    },
  });

  const submit = () => {
    setInlineError(null);
    const body = resolveSpec();
    if (body) save.mutate(body);
  };

  const setParam = (i: number, next: ParamDraft) => setParams((cur) => cur.map((p, j) => (j === i ? next : p)));
  const canSave = useRaw ? rawText.trim() !== '' : name.trim() !== '' && (kind === 'python' ? code.trim() !== '' : url.trim() !== '');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{spec ? `Edit tool — ${spec.name}` : 'New tool'}</DialogTitle>
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
              label="Tool spec (JSON)"
              multiline
              minRows={18}
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
                <TextField select label="Kind" value={kind} onChange={(e) => setKind(e.target.value as ToolKind)} sx={{ minWidth: 140 }}>
                  <MenuItem value="http">http</MenuItem>
                  <MenuItem value="python">python</MenuItem>
                </TextField>
                <TextField
                  label="Timeout (s)"
                  type="number"
                  value={timeout_}
                  onChange={(e) => setTimeout_(e.target.value === '' ? '' : Number(e.target.value))}
                  inputProps={{ min: 1, max: 120 }}
                  sx={{ width: 130 }}
                />
              </Stack>
              <TextField label="Description" required multiline minRows={2} value={description} onChange={(e) => setDescription(e.target.value)} helperText="shown to the model — say when to use the tool" />

              <Divider />
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="subtitle1" fontWeight={600}>Parameters</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setParams((p) => [...p, { name: '', type: 'string', description: '', required: false }])}>
                  Add parameter
                </Button>
              </Stack>
              {params.map((p, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  <TextField size="small" label="Name" value={p.name} onChange={(e) => setParam(i, { ...p, name: e.target.value })} sx={{ width: 160 }} inputProps={{ style: { fontFamily: 'monospace' } }} />
                  <TextField select size="small" label="Type" value={p.type} onChange={(e) => setParam(i, { ...p, type: e.target.value as ParamType })} sx={{ width: 120 }}>
                    {PARAM_TYPES.map((t) => (
                      <MenuItem key={t} value={t}>{t}</MenuItem>
                    ))}
                  </TextField>
                  <TextField size="small" label="Description" value={p.description} onChange={(e) => setParam(i, { ...p, description: e.target.value })} sx={{ flex: 1 }} />
                  <FormControlLabel control={<Switch size="small" checked={p.required} onChange={(e) => setParam(i, { ...p, required: e.target.checked })} />} label="Required" />
                  <IconButton size="small" color="error" aria-label="Remove parameter" onClick={() => setParams((cur) => cur.filter((_x, j) => j !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}

              <Divider />
              {kind === 'python' ? (
                <TextField
                  label="Python code"
                  required
                  multiline
                  minRows={10}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  helperText="must define def run(args): — runs only when CORTEX_PYTHON_TOOLS_ENABLED is set on the server"
                  inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
                />
              ) : (
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1}>
                    <TextField select size="small" label="Method" value={method} onChange={(e) => setMethod(e.target.value)} sx={{ width: 130 }}>
                      {METHODS.map((m) => (
                        <MenuItem key={m} value={m}>{m}</MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      size="small"
                      label="URL"
                      required
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      helperText="{param} placeholders must match declared parameters"
                      sx={{ flex: 1 }}
                      inputProps={{ style: { fontFamily: 'monospace' } }}
                    />
                  </Stack>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="subtitle2">Headers</Typography>
                    <Button size="small" startIcon={<AddIcon />} onClick={() => setHeaders((h) => [...h, { key: '', value: '' }])}>
                      Add header
                    </Button>
                  </Stack>
                  {headers.map((h, i) => (
                    <Stack key={i} direction="row" spacing={1} alignItems="center">
                      <TextField size="small" label="Header" value={h.key} onChange={(e) => setHeaders((cur) => cur.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} sx={{ width: 220 }} />
                      <TextField size="small" label="Value" value={h.value} onChange={(e) => setHeaders((cur) => cur.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} sx={{ flex: 1 }} />
                      <IconButton size="small" color="error" aria-label="Remove header" onClick={() => setHeaders((cur) => cur.filter((_x, j) => j !== i))}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ))}
                  <TextField
                    label="Body"
                    multiline
                    minRows={3}
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    helperText="JSON or plain text; {param} placeholders allowed; empty = no body"
                    inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
                  />
                </Stack>
              )}

              <Divider />
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>Tests</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Enabling requires a non-empty, fully passing suite. Each test runs the tool with the given args.
                  </Typography>
                </Box>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setTests((t) => [...t, { args: {}, mode: 'expect_contains', value: '' }])}>
                  Add test
                </Button>
              </Stack>
              {tests.map((t, i) => (
                <Paper key={i} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                        Test {i + 1} args
                      </Typography>
                      <IconButton size="small" color="error" aria-label="Remove test" onClick={() => setTests((cur) => cur.filter((_x, j) => j !== i))}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    <ArgInputs
                      params={params.filter((p) => p.name.trim())}
                      args={t.args}
                      onChange={(pname, v) => setTests((cur) => cur.map((x, j) => (j === i ? { ...x, args: { ...x.args, [pname]: v } } : x)))}
                    />
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField
                        select
                        size="small"
                        label="Expectation"
                        value={t.mode}
                        onChange={(e) => setTests((cur) => cur.map((x, j) => (j === i ? { ...x, mode: e.target.value as ExpectMode } : x)))}
                        sx={{ minWidth: 200 }}
                      >
                        {EXPECT_MODES.map((m) => (
                          <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                        ))}
                      </TextField>
                      {t.mode !== 'expect_error' && (
                        <TextField
                          size="small"
                          label={t.mode === 'expect_regex' ? 'Regex' : 'Substring'}
                          value={t.value}
                          onChange={(e) => setTests((cur) => cur.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                          sx={{ flex: 1 }}
                          inputProps={t.mode === 'expect_regex' ? { style: { fontFamily: 'monospace' } } : undefined}
                        />
                      )}
                    </Stack>
                  </Stack>
                </Paper>
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
          {spec ? 'Save changes' : 'Create tool'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
