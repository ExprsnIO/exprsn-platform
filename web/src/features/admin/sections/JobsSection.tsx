import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
} from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import ReplayIcon from '@mui/icons-material/Replay';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  timelineJobsApi,
  prefetchAdminApi,
  timelineConfigApi,
  asQueueMap,
  TIMELINE_CONFIG_SECTIONS,
  PREFETCH_CONFIG_SECTIONS,
  type Job,
} from '@/api/admin/jobs';
import { Card, ConfigSectionEditor, DataTable, DataView, JsonDialog, QueryState, SectionHeader, StatCard, useToast } from '../ui';

const JOB_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'];

function jobRows(d: { jobs?: Job[]; data?: Job[]; failed?: Job[] }): Job[] {
  return d.jobs ?? d.data ?? d.failed ?? [];
}

/* ----------------------------------------------------------- timeline jobs */

function TimelineJobsTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [queue, setQueue] = useState<string>('');
  const [status, setStatus] = useState('waiting');
  const stats = useQuery({ queryKey: ['jobs', 'timeline', 'stats'], queryFn: timelineJobsApi.stats });
  const queues = Object.keys(asQueueMap(stats.data));
  const activeQueue = queue || queues[0] || '';

  const jobs = useQuery({
    queryKey: ['jobs', 'timeline', activeQueue, status],
    queryFn: () => timelineJobsApi.jobs(activeQueue, { status, limit: 50 }),
    enabled: !!activeQueue,
  });

  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => {
      onToast(msg);
      qc.invalidateQueries({ queryKey: ['jobs', 'timeline'] });
    }).catch((e) => onToast((e as Error).message));

  return (
    <Stack spacing={2}>
      <QueryState query={stats} empty="No timeline queues reported.">
        {() => {
          const map = asQueueMap(stats.data);
          return (
            <Stack spacing={1.5}>
              {Object.entries(map).map(([name, qs]) => (
                <Card
                  key={name}
                  title={name}
                  actions={
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="Pause"><IconButton size="small" onClick={() => act(() => timelineJobsApi.pause(name), `Paused ${name}`)}><PauseIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Resume"><IconButton size="small" onClick={() => act(() => timelineJobsApi.resume(name), `Resumed ${name}`)}><PlayArrowIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Clean completed (>1h)"><IconButton size="small" onClick={() => act(() => timelineJobsApi.clean(name), `Cleaned ${name}`)}><CleaningServicesIcon fontSize="small" /></IconButton></Tooltip>
                    </Stack>
                  }
                >
                  <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                    {['waiting', 'active', 'completed', 'failed', 'delayed', 'paused'].map((k) => (
                      <Chip key={k} size="small" variant="outlined" label={`${k}: ${qs[k] ?? 0}`} />
                    ))}
                  </Stack>
                </Card>
              ))}
            </Stack>
          );
        }}
      </QueryState>

      <Card title="Browse jobs">
        <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          <TextField select size="small" label="Queue" value={activeQueue} onChange={(e) => setQueue(e.target.value)} sx={{ minWidth: 180 }}>
            {queues.map((qn) => <MenuItem key={qn} value={qn}>{qn}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="State" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 140 }}>
            {JOB_STATES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
        </Stack>
        {activeQueue && (
          <QueryState query={jobs} empty="No jobs in this state.">
            {(d) => (
              <DataTable
                rows={jobRows(d)}
                rowKey={(j) => String(j.id)}
                columns={[
                  { key: 'id', header: 'Job', mono: true },
                  { key: 'name', header: 'Name', render: (j) => j.name ?? '—' },
                  { key: 'attemptsMade', header: 'Attempts', align: 'right', render: (j) => j.attemptsMade ?? 0 },
                  { key: 'failedReason', header: 'Failed reason', render: (j) => (j.failedReason ?? '').slice(0, 60) || '—' },
                  {
                    key: 'actions',
                    header: '',
                    align: 'right',
                    render: (j) => (
                      <>
                        <Tooltip title="Retry"><IconButton size="small" onClick={() => act(() => timelineJobsApi.retry(activeQueue, String(j.id)), 'Retried')}><ReplayIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Remove"><IconButton size="small" color="error" onClick={() => act(() => timelineJobsApi.remove(activeQueue, String(j.id)), 'Removed')}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                      </>
                    ),
                  },
                ]}
              />
            )}
          </QueryState>
        )}
      </Card>
    </Stack>
  );
}

/* --------------------------------------------------------------- prefetch */

function PrefetchTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  const stats = useQuery({ queryKey: ['jobs', 'prefetch', 'stats'], queryFn: prefetchAdminApi.queueStats });
  const failed = useQuery({ queryKey: ['jobs', 'prefetch', 'failed'], queryFn: () => prefetchAdminApi.failed(25) });
  const metrics = useQuery({ queryKey: ['jobs', 'prefetch', 'metrics'], queryFn: prefetchAdminApi.metrics });

  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { onToast(msg); qc.invalidateQueries({ queryKey: ['jobs', 'prefetch'] }); }).catch((e) => onToast((e as Error).message));
  const lookup = (fn: () => Promise<unknown>, title: string) =>
    fn().then((v) => setView({ title, value: v })).catch((e) => onToast((e as Error).message));

  return (
    <Stack spacing={2}>
      <QueryState query={stats}>
        {(raw) => {
          // Shape: { success, data: { name, waiting, active, completed, failed, delayed } }
          const s = ((raw.data as Record<string, unknown>) ?? raw) as Record<string, unknown>;
          return (
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              {['waiting', 'active', 'completed', 'failed', 'delayed'].map((k) => (
                <StatCard key={k} label={k} value={(s[k] as number) ?? 0} />
              ))}
            </Stack>
          );
        }}
      </QueryState>

      <Card title="Per-user prefetch controls">
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          <TextField size="small" label="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} sx={{ minWidth: 280 }} />
          <Button size="small" variant="outlined" disabled={!userId} onClick={() => act(() => prefetchAdminApi.immediate(userId), 'Immediate prefetch queued')}>Prefetch now</Button>
          <Button size="small" variant="outlined" disabled={!userId} onClick={() => act(() => prefetchAdminApi.schedule(userId), 'Prefetch scheduled')}>Schedule</Button>
          <Button size="small" disabled={!userId} onClick={() => lookup(() => prefetchAdminApi.userStatus(userId), 'Prefetch status')}>Status</Button>
          <Button size="small" disabled={!userId} onClick={() => lookup(() => prefetchAdminApi.userCache(userId), 'Cached timeline')}>Cache</Button>
          <Button size="small" color="error" disabled={!userId} onClick={() => act(() => prefetchAdminApi.clearUser(userId), 'Cache cleared')}>Clear</Button>
        </Stack>
      </Card>

      <Card title="Failed jobs">
        <QueryState query={failed} empty="No failed jobs.">
          {(d) => (
            <DataTable
              rows={jobRows(d)}
              rowKey={(j) => String(j.id)}
              columns={[
                { key: 'id', header: 'Job', mono: true },
                { key: 'failedReason', header: 'Reason', render: (j) => (j.failedReason ?? '').slice(0, 80) || '—' },
                { key: 'attemptsMade', header: 'Attempts', align: 'right', render: (j) => j.attemptsMade ?? 0 },
                { key: 'retry', header: '', align: 'right', render: (j) => <Button size="small" onClick={() => act(() => prefetchAdminApi.retry(String(j.id)), 'Retried')}>Retry</Button> },
              ]}
            />
          )}
        </QueryState>
      </Card>

      <Card title="Metrics" actions={<Button size="small" onClick={() => setView({ title: 'Prefetch metrics', value: metrics.data })} disabled={!metrics.data}>View raw</Button>}>
        <QueryState query={metrics}>{(d) => <DataView value={d} />}</QueryState>
      </Card>

      <ConfigSectionEditor sections={PREFETCH_CONFIG_SECTIONS} load={(s) => prefetchAdminApi.getConfigSection(s)} save={(s, data) => prefetchAdminApi.saveConfigSection(s, data)} />
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </Stack>
  );
}

/* --------------------------------------------------------- timeline config */

function TimelineConfigTab() {
  return <ConfigSectionEditor sections={TIMELINE_CONFIG_SECTIONS} load={(s) => timelineConfigApi.getConfigSection(s)} save={(s, data) => timelineConfigApi.saveConfigSection(s, data)} />;
}

/* ------------------------------------------------------------------- page */

type JobsTab = 'timeline' | 'prefetch' | 'config';

export function JobsSection() {
  const [tab, setTab] = useState<JobsTab>('timeline');
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Jobs & Queues" subtitle="Timeline + prefetch Bull queues (worker processes) — /timeline/api/jobs, /prefetch/api/prefetch" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab value="timeline" label="Timeline jobs" />
        <Tab value="prefetch" label="Prefetch" />
        <Tab value="config" label="Timeline config" />
      </Tabs>
      {tab === 'timeline' && <TimelineJobsTab onToast={showToast} />}
      {tab === 'prefetch' && <PrefetchTab onToast={showToast} />}
      {tab === 'config' && <TimelineConfigTab />}
      {ToastHost}
    </Stack>
  );
}
