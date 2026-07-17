import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  prefetchAdminApi,
  prefetchModuleApi,
  PREFETCH_CONFIG_SECTIONS,
  type Job,
} from '@/api/admin/prefetch';
import {
  Card,
  ConfigSectionEditor,
  DataTable,
  DataView,
  JsonDialog,
  QueryState,
  SectionHeader,
  StatCard,
  StatusChip,
  useToast,
} from '../ui';

function jobRows(d: { jobs?: Job[]; data?: Job[] | { jobs?: Job[] }; failed?: Job[] }): Job[] {
  if (Array.isArray(d.jobs)) return d.jobs;
  if (Array.isArray(d.data)) return d.data;
  if (d.data && Array.isArray((d.data as { jobs?: Job[] }).jobs)) return (d.data as { jobs: Job[] }).jobs;
  return d.failed ?? [];
}

/* --------------------------------------------------------------- overview */

function OverviewTab() {
  const stats = useQuery({ queryKey: ['prefetch', 'queue', 'stats'], queryFn: prefetchAdminApi.queueStats, refetchInterval: 10000 });
  const metrics = useQuery({ queryKey: ['prefetch', 'metrics'], queryFn: prefetchAdminApi.metrics });
  const health = useQuery({ queryKey: ['prefetch', 'health'], queryFn: prefetchModuleApi.health });

  return (
    <Stack spacing={2}>
      <QueryState query={stats} empty="No queue stats.">
        {(raw) => {
          // Shape: { success, data: { name, backend, waiting, ..., rabbit?: { depth, dlq } } }
          const s = (((raw as Record<string, unknown>).data as Record<string, unknown>) ?? raw) as Record<string, unknown>;
          const backend = (s.backend as string) || 'redis';
          const rabbit = s.rabbit as { depth?: number; dlq?: number } | undefined;
          return (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" color="text.secondary">Queue backend:</Typography>
                <Chip size="small" color={backend === 'rabbitmq' ? 'secondary' : 'default'} label={backend} />
              </Stack>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                {['waiting', 'active', 'completed', 'failed', 'delayed'].map((k) => (
                  <StatCard key={k} label={k} value={(s[k] as number) ?? 0} />
                ))}
                {backend === 'rabbitmq' && rabbit && (
                  <>
                    <StatCard label="rabbit depth" value={rabbit.depth ?? 0} />
                    <StatCard label="rabbit DLQ" value={rabbit.dlq ?? 0} hint="dead-lettered" />
                  </>
                )}
              </Stack>
            </Stack>
          );
        }}
      </QueryState>

      <Card title="Cache & prefetch metrics">
        <QueryState query={metrics} empty="No metrics.">
          {(d) => <DataView value={d} />}
        </QueryState>
      </Card>

      <Card
        title="Service health"
        actions={health.data?.status ? <StatusChip status={health.data.status === 'healthy' ? 'active' : String(health.data.status)} /> : undefined}
      >
        <QueryState query={health} empty="No health data.">
          {(h) => <DataView value={h.checks ?? h} />}
        </QueryState>
      </Card>
    </Stack>
  );
}

/* ------------------------------------------------------------------ queue */

function QueueTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [date, setDate] = useState('');
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  const failed = useQuery({ queryKey: ['prefetch', 'queue', 'failed'], queryFn: () => prefetchAdminApi.failed(50) });

  const retry = (jobId: string) =>
    prefetchAdminApi
      .retry(jobId)
      .then(() => {
        onToast('Job retry initiated');
        qc.invalidateQueries({ queryKey: ['prefetch', 'queue'] });
      })
      .catch((e) => onToast((e as Error).message));

  return (
    <Stack spacing={2}>
      <Card title="Failed jobs">
        <QueryState query={failed} empty="No failed jobs.">
          {(d) => (
            <DataTable
              tableId="prefetch-failed-jobs"
              rows={jobRows(d)}
              rowKey={(j) => String(j.id)}
              columns={[
                { key: 'id', header: 'Job', mono: true },
                { key: 'name', header: 'Name', render: (j) => j.name ?? '—' },
                { key: 'failedReason', header: 'Reason', render: (j) => (j.failedReason ?? '').slice(0, 80) || '—' },
                { key: 'attemptsMade', header: 'Attempts', align: 'right', render: (j) => j.attemptsMade ?? 0 },
                {
                  key: 'retry',
                  header: '',
                  align: 'right',
                  locked: true,
                  render: (j) => <Button size="small" onClick={() => retry(String(j.id))}>Retry</Button>,
                },
              ]}
            />
          )}
        </QueryState>
      </Card>

      <Card title="Metrics by date">
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            size="small"
            variant="outlined"
            disabled={!date}
            onClick={() =>
              prefetchAdminApi
                .metricsByDate(date)
                .then((v) => setView({ title: `Metrics ${date}`, value: v }))
                .catch((e) => onToast((e as Error).message))
            }
          >
            Load
          </Button>
        </Stack>
      </Card>
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </Stack>
  );
}

/* ------------------------------------------------------------------ users */

function UsersTab({ onToast }: { onToast: (m: string) => void }) {
  const [userId, setUserId] = useState('');
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);

  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => onToast(msg)).catch((e) => onToast((e as Error).message));
  const lookup = (fn: () => Promise<unknown>, title: string) =>
    fn().then((v) => setView({ title, value: v })).catch((e) => onToast((e as Error).message));

  return (
    <Stack spacing={2}>
      <Card title="Per-user prefetch controls">
        <Stack spacing={2} sx={{ maxWidth: 640 }}>
          <TextField
            label="User ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="uuid of the user whose timeline cache to manage"
          />
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button size="small" variant="outlined" disabled={!userId} onClick={() => act(() => prefetchAdminApi.immediate(userId), 'Immediate prefetch queued')}>Prefetch now</Button>
            <Button size="small" variant="outlined" disabled={!userId} onClick={() => act(() => prefetchAdminApi.schedule(userId), 'Prefetch scheduled')}>Schedule</Button>
            <Button size="small" disabled={!userId} onClick={() => lookup(() => prefetchAdminApi.userStatus(userId), 'Prefetch status')}>Status</Button>
            <Button size="small" disabled={!userId} onClick={() => lookup(() => prefetchAdminApi.userCache(userId), 'Cached timeline')}>View cache</Button>
            <Button size="small" color="error" disabled={!userId} onClick={() => act(() => prefetchAdminApi.clearUser(userId), 'Cache cleared')}>Clear cache</Button>
          </Stack>
        </Stack>
      </Card>
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </Stack>
  );
}

/* ------------------------------------------------------------------- page */

type PrefetchTab = 'overview' | 'queue' | 'users' | 'config';

export function PrefetchSection() {
  const [tab, setTab] = useState<PrefetchTab>('overview');
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Prefetch" subtitle="Timeline cache warming — queue, metrics, per-user cache — /prefetch/api" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab value="overview" label="Overview" />
        <Tab value="queue" label="Queue" />
        <Tab value="users" label="Per-user cache" />
        <Tab value="config" label="Config" />
      </Tabs>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'queue' && <QueueTab onToast={showToast} />}
      {tab === 'users' && <UsersTab onToast={showToast} />}
      {tab === 'config' && (
        <ConfigSectionEditor
          sections={PREFETCH_CONFIG_SECTIONS}
          load={(s) => prefetchAdminApi.getConfigSection(s)}
          save={(s, data) => prefetchAdminApi.saveConfigSection(s, data)}
        />
      )}
      {ToastHost}
    </Stack>
  );
}
