/**
 * Shared pieces for the Cortex admin tabs: the module-disabled state, the
 * test-report dialog (guardrails + tools), the delete confirmation, and the
 * "Draft with AI" build dialog used by all three registries.
 */
import { ReactNode, useEffect, useState } from 'react';
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import {
  isCortexDisabled,
  type GuardrailSpec,
  type GuardrailTestReport,
  type SkillSpec,
  type ToolSpec,
  type ToolTestReport,
} from '@/api/cortex';
import {
  cortexAdminApi,
  buildProblemsFromError,
  type GuardrailBuildResult,
  type SkillBuildResult,
  type ToolBuildResult,
} from '@/api/admin/cortex';
import { toMessage } from '@/lib/errors';
import { DataTable, QueryState } from '@/features/admin/ui';

export type ToastFn = (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;

/** Channels the guardrail engine knows about (empty selection = all). */
export const KNOWN_CHANNELS = ['chat', 'cs_chat', 'cs_email', 'task'];

export const ACTION_COLOR: Record<string, 'warning' | 'info' | 'error'> = {
  warn: 'warning',
  escalate: 'info',
  block: 'error',
};

export function ActionChip({ action }: { action: string }) {
  return <Chip size="small" variant="outlined" color={ACTION_COLOR[action] ?? 'default'} label={action} />;
}

export function EnabledChip({ enabled }: { enabled: boolean }) {
  return (
    <Chip size="small" variant="outlined" color={enabled ? 'success' : 'default'} label={enabled ? 'enabled' : 'disabled'} />
  );
}

/* -------------------------------------------------------- disabled module */

export function ModuleDisabledAlert() {
  return (
    <Alert severity="warning">
      The Cortex module is disabled — every <code>/cortex/api/v1</code> endpoint answers 503
      CORTEX_DISABLED. Set <code>CORTEX_ENABLED=true</code> in the platform environment and restart
      the gateway to manage guardrails, tools, skills, reviews and the prompt log.
    </Alert>
  );
}

/** QueryState that renders the module-disabled alert instead of a raw 503. */
export function CortexQueryState<T>({
  query,
  empty,
  children,
}: {
  query: UseQueryResult<T>;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isError && isCortexDisabled(query.error)) return <ModuleDisabledAlert />;
  return (
    <QueryState query={query} empty={empty}>
      {children}
    </QueryState>
  );
}

/* ------------------------------------------------------------ test report */

function OkIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircleIcon fontSize="small" color="success" />
  ) : (
    <CancelIcon fontSize="small" color="error" />
  );
}

export interface ReportTarget {
  name: string;
  kind: 'guardrail' | 'tool';
  report: GuardrailTestReport | ToolTestReport;
  /** extra context, e.g. the enable-refused error message */
  note?: string;
}

export function ReportSummary({ report }: { report: { passed: number; failed: number } }) {
  return (
    <Stack direction="row" spacing={1}>
      <Chip size="small" color="success" variant="outlined" label={`${report.passed} passed`} />
      <Chip
        size="small"
        color={report.failed ? 'error' : 'default'}
        variant="outlined"
        label={`${report.failed} failed`}
      />
    </Stack>
  );
}

type GuardrailCase = GuardrailTestReport['results'][number];
type ToolCase = ToolTestReport['results'][number];

export function TestReportDialog({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  return (
    <Dialog open={!!target} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Test report — {target?.name}</DialogTitle>
      <DialogContent dividers>
        {target && (
          <Stack spacing={2}>
            {target.note && <Alert severity="error">{target.note}</Alert>}
            <ReportSummary report={target.report} />
            {target.report.results.length === 0 ? (
              <Alert severity="info">
                This spec has no tests. Enabling requires a non-empty, fully passing suite — add at
                least one test case in the editor.
              </Alert>
            ) : target.kind === 'guardrail' ? (
              <DataTable
                rows={target.report.results as GuardrailCase[]}
                rowKey={(_r, i) => String(i)}
                columns={[
                  { key: 'text', header: 'Test text', mono: true, render: (r) => r.text },
                  {
                    key: 'expect',
                    header: 'Expect',
                    render: (r) => <Chip size="small" variant="outlined" label={r.expect} />,
                  },
                  { key: 'triggered', header: 'Triggered', render: (r) => (r.triggered ? 'yes' : 'no') },
                  { key: 'ok', header: 'Result', align: 'center', render: (r) => <OkIcon ok={r.ok} /> },
                ]}
              />
            ) : (
              <DataTable
                rows={target.report.results as ToolCase[]}
                rowKey={(_r, i) => String(i)}
                columns={[
                  { key: 'args', header: 'Args', mono: true, render: (r) => JSON.stringify(r.args) },
                  {
                    key: 'output',
                    header: 'Output / error',
                    render: (r) =>
                      r.error != null ? (
                        <Typography variant="body2" color="error.main" component="span">
                          {r.error}
                        </Typography>
                      ) : (
                        <Box component="span" sx={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-word' }}>
                          {r.output ?? '—'}
                        </Box>
                      ),
                  },
                  { key: 'ok', header: 'Result', align: 'center', render: (r) => <OkIcon ok={r.ok} /> },
                ]}
              />
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/* --------------------------------------------------------- delete confirm */

export function ConfirmDeleteDialog({
  name,
  noun,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string | null;
  noun: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={!!name} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Delete {noun}?</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          This permanently deletes the {noun} <b>{name}</b>. Agents referencing it will no longer
          see it.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button color="error" variant="contained" disabled={busy} onClick={onConfirm}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ----------------------------------------------------------- build dialog */

export type BuildKind = 'guardrail' | 'tool' | 'skill';
type BuildResult = GuardrailBuildResult | ToolBuildResult | SkillBuildResult;

/**
 * "Draft with AI" — the LLM drafts a full spec from a plain-English
 * description. The draft is always saved DISABLED; 422 means the builder's
 * output failed validation (problems list). Drafting hits the local model and
 * can take 30–60s.
 */
export function BuildDialog({
  kind,
  open,
  onClose,
  onOpenEditor,
  toast,
}: {
  kind: BuildKind;
  open: boolean;
  onClose: () => void;
  onOpenEditor: (spec: GuardrailSpec | ToolSpec | SkillSpec) => void;
  toast: ToastFn;
}) {
  const qc = useQueryClient();
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [action, setAction] = useState('');
  const [toolKind, setToolKind] = useState('');

  const build = useMutation({
    mutationFn: (): Promise<BuildResult> => {
      if (kind === 'guardrail') {
        return cortexAdminApi.buildGuardrail(description, {
          name: name.trim() || undefined,
          action: action || undefined,
        });
      }
      if (kind === 'tool') {
        return cortexAdminApi.buildTool(description, {
          name: name.trim() || undefined,
          kind: toolKind || undefined,
        });
      }
      return cortexAdminApi.buildSkill(description, { name: name.trim() || undefined });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['cortex-admin', `${kind}s`] });
      toast(`Draft saved (disabled): ${res.saved}`, 'success');
    },
  });

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setName('');
    setAction('');
    setToolKind('');
    build.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const problems = build.isError ? buildProblemsFromError(build.error) : null;
  const result = build.data;
  const tests = result && 'tests' in result ? result.tests : undefined;

  return (
    <Dialog open={open} onClose={build.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Draft a {kind} with AI</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="Describe what it should do"
            multiline
            minRows={3}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              kind === 'guardrail'
                ? 'e.g. block replies that promise refunds or quote a discount over 20%'
                : kind === 'tool'
                  ? 'e.g. fetch the current UTC time from worldtimeapi.org'
                  : 'e.g. answer billing questions using the invoices tool, always cite the invoice id'
            }
            disabled={build.isPending}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={build.isPending}
              sx={{ flex: 1 }}
            />
            {kind === 'guardrail' && (
              <TextField
                select
                label="Action"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                disabled={build.isPending}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="">(builder decides)</MenuItem>
                {['warn', 'escalate', 'block'].map((a) => (
                  <MenuItem key={a} value={a}>
                    {a}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {kind === 'tool' && (
              <TextField
                select
                label="Kind"
                value={toolKind}
                onChange={(e) => setToolKind(e.target.value)}
                disabled={build.isPending}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="">(builder decides)</MenuItem>
                <MenuItem value="http">http</MenuItem>
                <MenuItem value="python">python</MenuItem>
              </TextField>
            )}
          </Stack>

          {build.isPending && (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Drafting with the local model — this can take 30–60 seconds…
              </Typography>
            </Stack>
          )}

          {build.isError && isCortexDisabled(build.error) && <ModuleDisabledAlert />}
          {build.isError && !isCortexDisabled(build.error) && (
            <Alert severity="error">
              {problems ? (
                <>
                  <Typography variant="body2" fontWeight={600}>
                    {problems.error}
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                    {problems.problems.map((p, i) => (
                      <li key={i}>
                        <Typography variant="body2" component="span">
                          {p}
                        </Typography>
                      </li>
                    ))}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Nothing was saved. Refine the description and try again.
                  </Typography>
                </>
              ) : (
                toMessage(build.error)
              )}
            </Alert>
          )}

          {result && (
            <Stack spacing={1.5}>
              <Alert severity="success">
                Saved <b>{result.saved}</b> — disabled until you review and enable it.
              </Alert>
              {'description' in result.spec && result.spec.description && (
                <Typography variant="body2" color="text.secondary">
                  {result.spec.description}
                </Typography>
              )}
              {tests && (
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2">Initial test run</Typography>
                  <ReportSummary report={tests} />
                </Stack>
              )}
              {result.next && (
                <Typography variant="caption" color="text.secondary">
                  Next: {result.next}
                </Typography>
              )}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={build.isPending}>
          Close
        </Button>
        {result ? (
          <Button variant="contained" onClick={() => onOpenEditor(result.spec)}>
            Open in editor
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={!description.trim() || build.isPending}
            onClick={() => build.mutate()}
          >
            Draft
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
