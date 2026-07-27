/**
 * Flow run history + test-run — per-run status with expandable per-step
 * results (status, attempts, duration, error/result). "Run now" fires the
 * flow immediately against a minimal manual context (real side effects, no
 * dry-run) so builders can verify wiring without waiting for a live event.
 */
import { useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lowcodeApi, type Flow, type FlowRun } from '@/api/lowcode';
import { toMessage } from '@/lib/errors';

const STATUS_COLOR: Record<FlowRun['status'], 'success' | 'warning' | 'error' | 'default'> = {
  success: 'success', partial: 'warning', error: 'error', skipped: 'default',
};

function RunRow({ run }: { run: FlowRun }) {
  const [open, setOpen] = useState(false);
  const at = run.startedAt || run.createdAt;
  return (
    <>
      <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
        <TableCell width={40}>
          <IconButton size="small" aria-label={open ? 'Collapse run details' : 'Expand run details'} tabIndex={-1}>{open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}</IconButton>
        </TableCell>
        <TableCell>{at ? new Date(at).toLocaleString() : '—'}</TableCell>
        <TableCell><Chip size="small" variant="outlined" label={run.trigger} /></TableCell>
        <TableCell><Chip size="small" color={STATUS_COLOR[run.status]} label={run.status} /></TableCell>
        <TableCell align="right">{run.steps?.length ?? 0} step(s)</TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={5} sx={{ py: 0, borderBottom: open ? undefined : 'none' }}>
          <Collapse in={open} unmountOnExit>
            <Box sx={{ py: 1 }}>
              {run.error && <Alert severity="warning" sx={{ mb: 1 }}>{run.error}</Alert>}
              {(run.steps ?? []).length === 0 ? (
                <Typography variant="caption" color="text.secondary">No steps ran.</Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell width={40}>#</TableCell><TableCell>Action</TableCell><TableCell>Status</TableCell>
                      <TableCell>Attempts</TableCell><TableCell>ms</TableCell><TableCell>Detail</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(run.steps ?? []).map((s) => (
                      <TableRow key={s.i}>
                        <TableCell>{s.i + 1}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{s.type}</TableCell>
                        <TableCell><Chip size="small" color={s.status === 'ok' ? 'success' : s.status === 'error' ? 'error' : 'default'} label={s.status} /></TableCell>
                        <TableCell>{s.attempts ?? '—'}</TableCell>
                        <TableCell>{s.ms ?? '—'}</TableCell>
                        <TableCell sx={{ maxWidth: 320 }}>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {s.error ?? (s.result !== undefined && s.result !== null ? JSON.stringify(s.result).slice(0, 200) : '—')}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export function FlowRunsDialog({ open, flow, onClose }: { open: boolean; flow: Flow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const runsQ = useQuery({
    queryKey: ['lowcode', 'flow-runs', flow?.id],
    queryFn: () => lowcodeApi.flowRuns(flow!.id),
    enabled: open && !!flow,
  });

  const execute = useMutation({
    mutationFn: () => lowcodeApi.executeFlow(flow!.id, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lowcode', 'flow-runs', flow?.id] }),
  });

  const runs = runsQ.data?.runs ?? [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Runs — {flow?.name ?? ''}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              size="small" variant="outlined" startIcon={<PlayArrowIcon />}
              disabled={execute.isPending || !flow}
              onClick={() => execute.mutate()}
            >
              Run now
            </Button>
            <Typography variant="caption" color="text.secondary">
              Executes the actions immediately (real side effects), even while disabled.
            </Typography>
            <span style={{ flex: 1 }} />
            <Tooltip title="Refresh">
              <IconButton aria-label="Refresh" size="small" onClick={() => runsQ.refetch()}><RefreshIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Stack>

          {execute.isError && <Alert severity="error">{toMessage(execute.error)}</Alert>}
          {runsQ.isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress size={28} /></Box>}
          {runsQ.isError && <Alert severity="error">Failed to load runs.</Alert>}
          {!runsQ.isLoading && runs.length === 0 && <Alert severity="info">No runs yet — this flow hasn't fired.</Alert>}

          {runs.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={40} /><TableCell>When</TableCell><TableCell>Trigger</TableCell>
                  <TableCell>Status</TableCell><TableCell align="right">Steps</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {runs.map((r) => <RunRow key={r.id} run={r} />)}
              </TableBody>
            </Table>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
