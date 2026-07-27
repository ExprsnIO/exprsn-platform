/**
 * Tool registry: list + lifecycle (save → test → enable, test-gated) plus
 * "Run" for executing a tool immediately with typed inputs.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, IconButton, Stack, Tooltip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { cortexApi, type ToolSpec } from '@/api/cortex';
import { cortexAdminApi, testReportFromError } from '@/api/admin/cortex';
import { toMessage } from '@/lib/errors';
import { DataTable, SectionHeader } from '@/features/admin/ui';
import {
  BuildDialog,
  ConfirmDeleteDialog,
  CortexQueryState,
  EnabledChip,
  TestReportDialog,
  type ReportTarget,
  type ToastFn,
} from './common';
import { ToolDialog } from './ToolDialog';
import { RunToolDialog } from './RunToolDialog';

const QK = ['cortex-admin', 'tools'];

export function ToolsTab({ toast }: { toast: ToastFn }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: QK, queryFn: cortexApi.tools });
  const [editor, setEditor] = useState<{ spec: ToolSpec | null } | null>(null);
  const [buildOpen, setBuildOpen] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const openEditor = (name: string) =>
    cortexAdminApi
      .tool(name)
      .then((spec) => setEditor({ spec }))
      .catch((e) => toast(toMessage(e), 'error'));

  const test = useMutation({
    mutationFn: (name: string) => cortexAdminApi.testTool(name).then((r) => ({ name, r })),
    onSuccess: ({ name, r }) => setReport({ name, kind: 'tool', report: r }),
    onError: (e) => toast(toMessage(e), 'error'),
  });

  const enable = useMutation({
    mutationFn: (name: string) => cortexAdminApi.enableTool(name),
    onSuccess: (r) => {
      toast(`Tool enabled: ${r.enabled}`, 'success');
      invalidate();
    },
    onError: (e, name) => {
      const tests = testReportFromError(e);
      if (tests) setReport({ name, kind: 'tool', report: tests, note: toMessage(e) });
      else toast(toMessage(e), 'error');
    },
  });

  const disable = useMutation({
    mutationFn: (name: string) => cortexAdminApi.disableTool(name),
    onSuccess: (r) => {
      toast(`Tool disabled: ${r.disabled}`, 'success');
      invalidate();
    },
    onError: (e) => toast(toMessage(e), 'error'),
  });

  const del = useMutation({
    mutationFn: (name: string) => cortexAdminApi.deleteTool(name),
    onSuccess: (r) => {
      toast(`Tool deleted: ${r.deleted}`, 'success');
      setToDelete(null);
      invalidate();
    },
    onError: (e) => toast(toMessage(e), 'error'),
  });

  return (
    <Stack spacing={2}>
      <SectionHeader
        level={2}
        title="Tools"
        subtitle="Custom http/python tools agents can call — save → test → enable (test-gated)"
        actions={
          <>
            <Button variant="outlined" onClick={() => setBuildOpen(true)}>
              Draft with AI
            </Button>
            <Button variant="contained" onClick={() => setEditor({ spec: null })}>
              New tool
            </Button>
          </>
        }
      />
      <CortexQueryState query={query} empty="No tools yet.">
        {(d) => (
          <DataTable
            rows={d.tools}
            rowKey={(t) => t.name}
            tableId="cortex-tools"
            sortable
            filterable
            onRowClick={(t) => openEditor(t.name)}
            empty="No tools yet."
            columns={[
              { key: 'name', header: 'Name', mono: true },
              { key: 'enabled', header: 'Status', render: (t) => <EnabledChip enabled={t.enabled} /> },
              {
                key: 'kind',
                header: 'Kind',
                render: (t) =>
                  t.kind ? (
                    <Chip size="small" variant="outlined" color={t.kind === 'python' ? 'secondary' : 'info'} label={t.kind} />
                  ) : (
                    '—'
                  ),
              },
              {
                key: 'params',
                header: 'Parameters',
                filterValue: (t) => t.params.join(' '),
                render: (t) =>
                  t.params.length ? (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {t.params.map((p) => (
                        <Chip key={p} size="small" variant="outlined" label={p} />
                      ))}
                    </Stack>
                  ) : (
                    '—'
                  ),
              },
              { key: 'description', header: 'Description', defaultHidden: true },
              { key: 'tests', header: 'Tests', align: 'right' },
              {
                key: 'actions',
                header: '',
                align: 'right',
                locked: true,
                render: (t) => (
                  <>
                    <Button size="small" onClick={() => setRunning(t.name)}>
                      Run
                    </Button>
                    <Button size="small" disabled={test.isPending} onClick={() => test.mutate(t.name)}>
                      Test
                    </Button>
                    <Button
                      size="small"
                      disabled={enable.isPending || disable.isPending}
                      onClick={() => (t.enabled ? disable.mutate(t.name) : enable.mutate(t.name))}
                    >
                      {t.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => setToDelete(t.name)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                ),
              },
            ]}
          />
        )}
      </CortexQueryState>

      <ToolDialog open={!!editor} spec={editor?.spec ?? null} onClose={() => setEditor(null)} toast={toast} />
      <BuildDialog
        kind="tool"
        open={buildOpen}
        onClose={() => setBuildOpen(false)}
        onOpenEditor={(spec) => {
          setBuildOpen(false);
          setEditor({ spec: spec as ToolSpec });
        }}
        toast={toast}
      />
      <RunToolDialog name={running} onClose={() => setRunning(null)} />
      <TestReportDialog target={report} onClose={() => setReport(null)} />
      <ConfirmDeleteDialog
        name={toDelete}
        noun="tool"
        busy={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete)}
      />
    </Stack>
  );
}
