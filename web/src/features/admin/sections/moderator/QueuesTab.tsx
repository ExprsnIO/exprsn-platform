/**
 * Queues admin tab — DataTable of moderation queues with New/Edit/Delete and a
 * counts summary. Backend: /moderator/api/queues.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { moderatorAdminApi, type QueueSpec, type QueueWithCounts } from '@/api/admin/moderator';
import { DataTable, QueryState, SectionHeader, StatusChip } from '../../ui';
import { QueueBuilderDialog } from './QueueBuilderDialog';

/** Inspect + re-drive/purge a bucket's dead-letter queue. */
function DlqDialog({ name, onClose, onToast }: { name: string; onClose: () => void; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mod', 'queues', 'dlq', name], queryFn: () => moderatorAdminApi.dlqItems(name, 50) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['mod', 'queues', 'dlq', name] });
    qc.invalidateQueries({ queryKey: ['mod', 'queues'] });
  };
  const redrive = () =>
    moderatorAdminApi.redriveDlq(name).then((r) => { onToast(`Re-drove ${r.moved ?? 0} item(s)`); refresh(); }).catch((e) => onToast((e as Error).message));
  const purge = () =>
    moderatorAdminApi.purgeDlq(name).then((r) => { onToast(`Purged ${r.purged ?? 0} item(s)`); refresh(); }).catch((e) => onToast((e as Error).message));

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Dead-letter queue — {name}</DialogTitle>
      <DialogContent dividers>
        {q.isLoading ? (
          <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={22} /></Stack>
        ) : q.error ? (
          <Alert severity="error">{(q.error as Error).message}</Alert>
        ) : (q.data?.items?.length ?? 0) === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>No dead-lettered items. Depth: {q.data?.depth ?? 0}.</Typography>
        ) : (
          <Stack spacing={1}>
            <Typography variant="caption" color="text.secondary">Depth: {q.data?.depth ?? 0} · showing {q.data?.items?.length}</Typography>
            {q.data?.items?.map((it, i) => {
              const payload = (it.payload ?? it) as Record<string, unknown>;
              return (
                <Stack key={i} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {String(payload.contentType ?? '—')} · {String(payload.contentId ?? payload.moderationItemId ?? '—')}
                    {payload.authorDid ? ` · ${String(payload.authorDid)}` : ''}
                  </Typography>
                  {it.error ? <Typography variant="caption" color="error.main">error: {String(it.error)}</Typography> : null}
                </Stack>
              );
            })}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="error" onClick={purge}>Purge all</Button>
        <Button onClick={redrive}>Re-drive all</Button>
        <Button variant="contained" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/** A small labelled count chip; the DLQ chip turns red when non-zero. */
function CountChip({ label, value, danger }: { label: string; value?: number; danger?: boolean }) {
  if (typeof value !== 'number') return null;
  return (
    <Chip
      size="small"
      variant="outlined"
      color={danger && value > 0 ? 'error' : 'default'}
      label={`${label} ${value}`}
      sx={{ fontVariantNumeric: 'tabular-nums' }}
    />
  );
}

/** Backend-aware live counts: Bull job states or rabbit depth, plus DLQ. */
function CountsCell({ q }: { q: QueueWithCounts }) {
  const c = q.counts;
  if (!c) return <>—</>;
  const chips =
    q.backend === 'rabbitmq'
      ? (
        <>
          {c.wired === false && <Chip size="small" color="warning" variant="outlined" label="broker down" />}
          <CountChip label="depth" value={c.depth} />
          <CountChip label="DLQ" value={c.dlq} danger />
          {typeof c.pending === 'number' && c.pending > 0 && <CountChip label="pending" value={c.pending} danger />}
        </>
      )
      : (
        <>
          <CountChip label="wait" value={c.waiting} />
          <CountChip label="active" value={c.active} />
          <CountChip label="done" value={c.completed} />
          <CountChip label="fail" value={c.failed} danger />
          <CountChip label="DLQ" value={c.dlq} danger />
        </>
      );
  return <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>{chips}</Stack>;
}

export function QueuesTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ queue: QueueSpec | null } | null>(null);
  const [dlq, setDlq] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['mod', 'queues'], queryFn: moderatorAdminApi.queues });

  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { onToast(msg); qc.invalidateQueries({ queryKey: ['mod', 'queues'] }); }).catch((e) => onToast((e as Error).message));

  const edit = (q: QueueWithCounts) => {
    // Strip the read-only `counts` field before handing the spec to the editor.
    const { counts: _counts, ...spec } = q;
    void _counts;
    setDialog({ queue: spec });
  };

  return (
    <Stack spacing={2}>
      <SectionHeader
        title="Queues"
        subtitle="Routing queues for moderation items — /moderator/api/queues"
        actions={<Button variant="contained" onClick={() => setDialog({ queue: null })}>New queue</Button>}
      />
      <QueryState query={query} empty="No queues.">
        {(d) => (
          <DataTable
            rows={d.queues ?? []}
            rowKey={(q) => q.name}
            columns={[
              { key: 'name', header: 'Name', mono: true, render: (q) => q.name },
              { key: 'displayName', header: 'Display', render: (q) => q.displayName || '—' },
              { key: 'backend', header: 'Backend', render: (q) => <Chip size="small" variant="outlined" label={q.backend} /> },
              { key: 'priority', header: 'Priority', render: (q) => <StatusChip status={q.priority} /> },
              { key: 'concurrency', header: 'Conc.', align: 'right', render: (q) => q.concurrency ?? '—' },
              { key: 'enabled', header: 'Enabled', render: (q) => (q.enabled ? 'yes' : 'no') },
              {
                key: 'consumer',
                header: 'Consumer',
                render: (q) => <Chip size="small" color={q.consumer ? 'success' : 'default'} variant={q.consumer ? 'filled' : 'outlined'} label={q.consumer ? 'live' : 'off'} />,
              },
              { key: 'processed', header: 'Processed', align: 'right', render: (q) => q.processed ?? 0 },
              { key: 'counts', header: 'Counts', render: (q) => <CountsCell q={q} /> },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (q) => (
                  <>
                    {(q.counts?.dlq ?? 0) > 0 && (
                      <Tooltip title={`Dead-letter queue (${q.counts?.dlq})`}>
                        <IconButton size="small" color="error" onClick={() => setDlq(q.name)}><WarningAmberIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => edit(q)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <IconButton size="small" color="error" onClick={() => { if (confirm(`Delete queue "${q.name}"?`)) act(() => moderatorAdminApi.deleteQueue(q.name), 'Deleted'); }}><DeleteIcon fontSize="small" /></IconButton>
                  </>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <QueueBuilderDialog open={!!dialog} queue={dialog?.queue} onClose={() => setDialog(null)} onDone={onToast} />
      {dlq && <DlqDialog name={dlq} onClose={() => setDlq(null)} onToast={onToast} />}
    </Stack>
  );
}
