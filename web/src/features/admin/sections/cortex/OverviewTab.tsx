/**
 * Cortex overview: /cortex/health (public — answers even while the module is
 * disabled) polled every 15s, plus the LLM router's model list. A 502 from
 * /models means the router itself is unreachable — shown inline, not a crash.
 */
import { useQuery } from '@tanstack/react-query';
import { Alert, Chip, Stack, Typography } from '@mui/material';
import { cortexApi, isCortexDisabled } from '@/api/cortex';
import { toMessage } from '@/lib/errors';
import { Card, DataTable, Loading, QueryState, StatCard, StatusChip } from '@/features/admin/ui';

function UpChip({ up, labels = ['up', 'down'] }: { up: boolean; labels?: [string, string] }) {
  return <Chip size="small" color={up ? 'success' : 'error'} variant="outlined" label={up ? labels[0] : labels[1]} />;
}

export function OverviewTab() {
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
    <Stack spacing={2}>
      <QueryState query={health}>
        {(h) => (
          <Stack spacing={2}>
            {!h.enabled && (
              <Alert severity="warning">
                Module disabled — set <code>CORTEX_ENABLED=true</code> to turn Cortex on. Health
                stays readable, but every <code>/cortex/api/v1</code> endpoint (and the other tabs
                here) answers 503 CORTEX_DISABLED.
              </Alert>
            )}
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <StatCard label="Module" value={<StatusChip status={h.enabled ? 'enabled' : 'disabled'} />} hint={h.status} />
              <StatCard label="LLM router" value={<UpChip up={h.router.up} />} hint={h.router.base} />
              <StatCard label="Brain model" value={h.brain} />
              <StatCard label="Judge model" value={h.judge} />
              <StatCard
                label="Cache"
                value={<UpChip up={h.cache.connected} labels={['connected', 'offline']} />}
              />
              <StatCard
                label="Queue waiting"
                value={h.queue.initialized ? h.queue.waiting ?? 0 : '—'}
                hint={h.queue.initialized ? undefined : h.queue.error ?? 'queue not initialized'}
              />
              <StatCard label="Queue active" value={h.queue.initialized ? h.queue.active ?? 0 : '—'} />
              <StatCard label="Queue failed" value={h.queue.initialized ? h.queue.failed ?? 0 : '—'} />
            </Stack>
          </Stack>
        )}
      </QueryState>

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
    </Stack>
  );
}
