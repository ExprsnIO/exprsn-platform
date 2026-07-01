/**
 * Recent workflow executions, with status chips and an expandable per-execution
 * step log (fetched on demand and rendered via JsonDialog / DataView).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@mui/material';
import { moderatorAdminApi, type Execution } from '@/api/admin/moderator';
import { formatDate } from '@/features/files/util';
import { DataTable, JsonDialog, QueryState, StatusChip } from '../../ui';

export function ExecutionsViewer({ onToast }: { onToast: (m: string) => void }) {
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  const query = useQuery({ queryKey: ['mod', 'executions'], queryFn: moderatorAdminApi.executions });

  const open = (id: string) =>
    moderatorAdminApi
      .getExecution(id)
      .then((r) => setView({ title: `Execution ${id.slice(0, 8)}`, value: r.execution ?? r }))
      .catch((e) => onToast((e as Error).message));

  return (
    <>
      <QueryState query={query} empty="No executions yet.">
        {(d) => (
          <DataTable
            rows={d.executions ?? []}
            rowKey={(e, i) => String(e.id ?? i)}
            columns={[
              { key: 'workflowName', header: 'Workflow', render: (e) => e.workflowName ?? e.workflowId ?? '—' },
              { key: 'status', header: 'Status', render: (e) => <StatusChip status={e.status} /> },
              { key: 'steps', header: 'Steps', align: 'right', render: (e) => (Array.isArray(e.steps) ? e.steps.length : 0) },
              { key: 'startedAt', header: 'Started', render: (e) => formatDate(e.startedAt) },
              { key: 'finishedAt', header: 'Finished', render: (e) => (e.finishedAt ? formatDate(e.finishedAt) : '—') },
              { key: 'error', header: 'Error', render: (e) => (e.error ? String(e.error).slice(0, 40) : '—') },
              { key: 'view', header: '', align: 'right', render: (e: Execution) => <Button size="small" onClick={() => open(e.id)}>View log</Button> },
            ]}
          />
        )}
      </QueryState>
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </>
  );
}
