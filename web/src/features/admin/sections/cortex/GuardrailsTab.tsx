/**
 * Guardrail registry: list + lifecycle (save → test → enable). Enable is
 * test-gated — a 400 comes back with the failing report, which we open in the
 * report dialog rather than toasting an opaque error string.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, IconButton, Stack, Tooltip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { cortexApi, type GuardrailSpec } from '@/api/cortex';
import { cortexAdminApi, testReportFromError } from '@/api/admin/cortex';
import { toMessage } from '@/lib/errors';
import { DataTable, SectionHeader } from '@/features/admin/ui';
import {
  ActionChip,
  BuildDialog,
  ConfirmDeleteDialog,
  CortexQueryState,
  EnabledChip,
  TestReportDialog,
  type ReportTarget,
  type ToastFn,
} from './common';
import { GuardrailDialog } from './GuardrailDialog';

const QK = ['cortex-admin', 'guardrails'];

export function GuardrailsTab({ toast }: { toast: ToastFn }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: QK, queryFn: cortexApi.guardrails });
  const [editor, setEditor] = useState<{ spec: GuardrailSpec | null } | null>(null);
  const [buildOpen, setBuildOpen] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const openEditor = (name: string) =>
    cortexAdminApi
      .guardrail(name)
      .then((spec) => setEditor({ spec }))
      .catch((e) => toast(toMessage(e), 'error'));

  const test = useMutation({
    mutationFn: (name: string) => cortexAdminApi.testGuardrail(name).then((r) => ({ name, r })),
    onSuccess: ({ name, r }) => setReport({ name, kind: 'guardrail', report: r }),
    onError: (e) => toast(toMessage(e), 'error'),
  });

  const enable = useMutation({
    mutationFn: (name: string) => cortexAdminApi.enableGuardrail(name),
    onSuccess: (r) => {
      toast(`Guardrail enabled: ${r.enabled}`, 'success');
      invalidate();
    },
    onError: (e, name) => {
      const tests = testReportFromError(e);
      if (tests) setReport({ name, kind: 'guardrail', report: tests, note: toMessage(e) });
      else toast(toMessage(e), 'error');
    },
  });

  const disable = useMutation({
    mutationFn: (name: string) => cortexAdminApi.disableGuardrail(name),
    onSuccess: (r) => {
      toast(`Guardrail disabled: ${r.disabled}`, 'success');
      invalidate();
    },
    onError: (e) => toast(toMessage(e), 'error'),
  });

  const del = useMutation({
    mutationFn: (name: string) => cortexAdminApi.deleteGuardrail(name),
    onSuccess: (r) => {
      toast(`Guardrail deleted: ${r.deleted}`, 'success');
      setToDelete(null);
      invalidate();
    },
    onError: (e) => toast(toMessage(e), 'error'),
  });

  return (
    <Stack spacing={2}>
      <SectionHeader
        level={2}
        title="Guardrails"
        subtitle="Typed rule sets screening agent input/output — save → test → enable (test-gated)"
        actions={
          <>
            <Button variant="outlined" onClick={() => setBuildOpen(true)}>
              Draft with AI
            </Button>
            <Button variant="contained" onClick={() => setEditor({ spec: null })}>
              New guardrail
            </Button>
          </>
        }
      />
      <CortexQueryState query={query} empty="No guardrails yet.">
        {(d) => (
          <DataTable
            rows={d.guardrails}
            rowKey={(g) => g.name}
            tableId="cortex-guardrails"
            sortable
            filterable
            onRowClick={(g) => openEditor(g.name)}
            empty="No guardrails yet."
            columns={[
              { key: 'name', header: 'Name', mono: true },
              { key: 'enabled', header: 'Status', render: (g) => <EnabledChip enabled={g.enabled} /> },
              { key: 'action', header: 'Action', render: (g) => <ActionChip action={g.action} /> },
              {
                key: 'scope',
                header: 'Scope',
                filterValue: (g) => g.scope.join(' '),
                render: (g) => (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {g.scope.map((s) => (
                      <Chip key={s} size="small" variant="outlined" label={s} />
                    ))}
                  </Stack>
                ),
              },
              {
                key: 'channels',
                header: 'Channels',
                filterValue: (g) => (g.channels ?? []).join(' ') || 'all',
                render: (g) =>
                  g.channels?.length ? (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {g.channels.map((c) => (
                        <Chip key={c} size="small" variant="outlined" label={c} />
                      ))}
                    </Stack>
                  ) : (
                    'all'
                  ),
              },
              { key: 'rules', header: 'Rules', align: 'right' },
              { key: 'tests', header: 'Tests', align: 'right' },
              {
                key: 'actions',
                header: '',
                align: 'right',
                locked: true,
                render: (g) => (
                  <>
                    <Button size="small" disabled={test.isPending} onClick={() => test.mutate(g.name)}>
                      Test
                    </Button>
                    <Button
                      size="small"
                      disabled={enable.isPending || disable.isPending}
                      onClick={() => (g.enabled ? disable.mutate(g.name) : enable.mutate(g.name))}
                    >
                      {g.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Tooltip title="Delete">
                      <IconButton aria-label="Delete" size="small" color="error" onClick={() => setToDelete(g.name)}>
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

      <GuardrailDialog open={!!editor} spec={editor?.spec ?? null} onClose={() => setEditor(null)} toast={toast} />
      <BuildDialog
        kind="guardrail"
        open={buildOpen}
        onClose={() => setBuildOpen(false)}
        onOpenEditor={(spec) => {
          setBuildOpen(false);
          setEditor({ spec: spec as GuardrailSpec });
        }}
        toast={toast}
      />
      <TestReportDialog target={report} onClose={() => setReport(null)} />
      <ConfirmDeleteDialog
        name={toDelete}
        noun="guardrail"
        busy={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete)}
      />
    </Stack>
  );
}
