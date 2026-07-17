/**
 * Cortex model list/status, extracted from OverviewTab for the consolidated
 * Infrastructure → AI view. Reads /cortex/health (public — answers even while
 * the module is disabled) to gate the /models call: a 502 from /models means
 * the LLM router itself is unreachable — shown inline, not a crash.
 */
import { useQuery } from '@tanstack/react-query';
import { Alert, Stack, Typography } from '@mui/material';
import { cortexApi, isCortexDisabled } from '@/api/cortex';
import { toMessage } from '@/lib/errors';
import { Card, DataTable, Loading, StatusChip } from '@/features/admin/ui';

export function ModelsTab() {
  const health = useQuery({
    queryKey: ['cortex-admin', 'health'],
    queryFn: cortexApi.health,
    refetchInterval: 15_000,
  });
  const enabled = health.data?.enabled === true;
  const models = useQuery({
    queryKey: ['cortex-admin', 'models'],
    queryFn: cortexApi.models,
    enabled,
    retry: false,
  });

  return (
    <Card title="Models">
      {!enabled ? (
        <Typography variant="body2" color="text.secondary">
          Model list is unavailable while the module is disabled.
        </Typography>
      ) : models.isLoading ? (
        <Loading />
      ) : models.isError ? (
        isCortexDisabled(models.error) ? (
          <Typography variant="body2" color="text.secondary">
            Model list is unavailable while the module is disabled.
          </Typography>
        ) : (
          <Alert severity="warning">LLM router unreachable — {toMessage(models.error)}</Alert>
        )
      ) : (
        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary">
            brain: {models.data?.brain}
          </Typography>
          <DataTable
            rows={models.data?.models ?? []}
            rowKey={(m) => m.id}
            empty="The router reported no models."
            columns={[
              { key: 'id', header: 'Model', mono: true },
              {
                key: 'status',
                header: 'Status',
                render: (m) => (m.status ? <StatusChip status={m.status} /> : '—'),
              },
            ]}
          />
        </Stack>
      )}
    </Card>
  );
}
