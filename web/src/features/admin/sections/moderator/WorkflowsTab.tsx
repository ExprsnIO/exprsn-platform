/**
 * Workflows admin tab — DataTable of workflows with New/Edit/Delete + Execute,
 * plus an Executions sub-view. Backend: /moderator/api/workflows.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, IconButton, Stack, Tooltip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { moderatorAdminApi, type WorkflowSpec } from '@/api/admin/moderator';
import { DataTable, JsonDialog, QueryState, SectionHeader } from '../../ui';
import { WorkflowBuilderDialog } from './WorkflowBuilderDialog';
import { WorkflowCanvasDialog } from './WorkflowCanvasDialog';
import { ExecutionsViewer } from './ExecutionsViewer';

function triggerText(w: WorkflowSpec): string {
  if (!w.trigger) return '—';
  return w.trigger.type === 'event' ? `event: ${w.trigger.event ?? '—'}` : 'manual';
}

export function WorkflowsTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [view, setView] = useState<'list' | 'executions'>('list');
  const [dialog, setDialog] = useState<{ workflow: WorkflowSpec | null } | null>(null);
  const [canvas, setCanvas] = useState<{ workflow: WorkflowSpec | null } | null>(null);
  const [result, setResult] = useState<{ title: string; value: unknown } | null>(null);
  const query = useQuery({ queryKey: ['mod', 'workflows'], queryFn: moderatorAdminApi.workflows });

  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { onToast(msg); qc.invalidateQueries({ queryKey: ['mod', 'workflows'] }); }).catch((e) => onToast((e as Error).message));

  const execute = (id: string) =>
    moderatorAdminApi
      .executeWorkflow(id)
      .then((v) => { setResult({ title: 'Execution result', value: v }); qc.invalidateQueries({ queryKey: ['mod', 'executions'] }); })
      .catch((e) => onToast((e as Error).message));

  return (
    <Stack spacing={2}>
      <SectionHeader
        level={2}
        title="Workflows"
        subtitle="Ordered moderation pipelines — /moderator/api/workflows"
        actions={
          <>
            <Button variant={view === 'list' ? 'contained' : 'outlined'} onClick={() => setView('list')}>Workflows</Button>
            <Button variant={view === 'executions' ? 'contained' : 'outlined'} onClick={() => setView('executions')}>Executions</Button>
            {view === 'list' && <Button variant="outlined" color="primary" onClick={() => setDialog({ workflow: null })}>New workflow</Button>}
            {view === 'list' && <Button variant="contained" color="primary" startIcon={<AccountTreeIcon />} onClick={() => setCanvas({ workflow: null })}>New (visual)</Button>}
          </>
        }
      />

      {view === 'executions' ? (
        <ExecutionsViewer onToast={onToast} />
      ) : (
        <QueryState query={query} empty="No workflows.">
          {(d) => (
            <DataTable
              rows={d.workflows ?? []}
              rowKey={(w) => w.id}
              columns={[
                { key: 'name', header: 'Name', render: (w) => w.name ?? '—' },
                { key: 'trigger', header: 'Trigger', render: (w) => triggerText(w) },
                { key: 'steps', header: 'Steps', align: 'right', render: (w) => (Array.isArray(w.steps) ? w.steps.length : 0) },
                { key: 'enabled', header: 'Enabled', render: (w) => (w.enabled ? 'yes' : 'no') },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (w) => (
                    <>
                      <Tooltip title="Execute"><IconButton size="small" color="success" onClick={() => execute(w.id)}><PlayArrowIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Visual editor"><IconButton size="small" onClick={() => setCanvas({ workflow: w })}><AccountTreeIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => setDialog({ workflow: w })}><EditIcon fontSize="small" /></IconButton></Tooltip>
                      <IconButton size="small" color="error" onClick={() => { if (confirm('Delete workflow?')) act(() => moderatorAdminApi.deleteWorkflow(w.id), 'Deleted'); }}><DeleteIcon fontSize="small" /></IconButton>
                    </>
                  ),
                },
              ]}
            />
          )}
        </QueryState>
      )}

      <WorkflowBuilderDialog open={!!dialog} workflow={dialog?.workflow} onClose={() => setDialog(null)} onDone={onToast} />
      <WorkflowCanvasDialog open={!!canvas} workflow={canvas?.workflow} onClose={() => setCanvas(null)} onDone={onToast} />
      <JsonDialog open={!!result} title={result?.title ?? ''} value={result?.value} onClose={() => setResult(null)} />
    </Stack>
  );
}
