import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
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
  timelineAdminApi,
  timelineJobsApi,
  timelineConfigApi,
  asQueueMap,
  TIMELINE_CONFIG_SECTIONS,
  type Job,
  type QueueStats,
} from '@/api/admin/timeline';
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

const JOB_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'];

/* --------------------------------------------------------------- overview */

function sumQueues(map: Record<string, QueueStats>, key: string): number {
  return Object.values(map).reduce((n, q) => n + (Number(q[key]) || 0), 0);
}

function OverviewTab() {
  const settings = useQuery({ queryKey: ['timeline', 'settings'], queryFn: timelineAdminApi.settings });
  const jobs = useQuery({ queryKey: ['timeline', 'jobs', 'stats'], queryFn: timelineJobsApi.stats, refetchInterval: 10000 });
  const health = useQuery({ queryKey: ['timeline', 'health'], queryFn: timelineAdminApi.health });

  const stats = settings.data?.stats ?? {};
  const queueMap = asQueueMap(jobs.data);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <StatCard label="Total posts" value={stats.totalPosts} />
        <StatCard label="Posts today" value={stats.todayPosts} />
        <StatCard label="Lists" value={stats.totalLists} />
        <StatCard label="Queues" value={Object.keys(queueMap).length} hint="Bull job queues" />
        <StatCard label="Jobs waiting" value={sumQueues(queueMap, 'waiting')} />
        <StatCard label="Jobs failed" value={sumQueues(queueMap, 'failed')} />
      </Stack>
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

/* -------------------------------------------------------------- approvals */

/** Manual decision console for posts held by "Require Approval for New Posts".
 *  The backend exposes only the per-post decision endpoint
 *  (POST /timeline/api/posts/:id/approval) — there is no endpoint listing held
 *  posts yet, so decisions are made against a known post id (from the
 *  configured approval mechanism's notification / lowcode flow). */
function ApprovalsTab({ onToast }: { onToast: (m: string) => void }) {
  const [postId, setPostId] = useState('');
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<unknown>(null);

  const policy = useQuery({ queryKey: ['timeline', 'moderation-policy'], queryFn: timelineAdminApi.moderationPolicy });
  const policyValues = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const f of policy.data?.fields ?? []) out[f.name] = f.value;
    return out;
  }, [policy.data]);

  const pending = useQuery({
    queryKey: ['timeline', 'pending-approvals'],
    queryFn: () => timelineAdminApi.pendingApprovals(),
    refetchInterval: 30_000,
  });

  const decide = useMutation({
    mutationFn: () => timelineAdminApi.approvalDecision(postId.trim(), decision, reason.trim() || undefined),
    onSuccess: () => {
      onToast(`Post ${decision}`);
      setPostId('');
      setReason('');
      pending.refetch();
    },
    onError: (e) => onToast((e as Error).message),
  });

  return (
    <Stack spacing={2}>
      <Card title="Approval policy">
        <QueryState query={policy} empty="No moderation policy loaded.">
          {() => (
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
              <Chip
                size="small"
                variant="outlined"
                color={policyValues.requireApproval ? 'warning' : 'default'}
                label={policyValues.requireApproval ? 'Approval required for new posts' : 'Approval not required'}
              />
              <Chip size="small" variant="outlined" label={`Mechanism: ${String(policyValues.approvalMechanism ?? '—')}`} />
              {!!policyValues.approvalTarget && (
                <Chip size="small" variant="outlined" label={`Target: ${String(policyValues.approvalTarget)}`} />
              )}
              <Chip
                size="small"
                variant="outlined"
                color={policyValues.autoModeration ? 'success' : 'default'}
                label={`Auto-moderation: ${policyValues.autoModeration ? 'on' : 'off'}`}
              />
            </Stack>
          )}
        </QueryState>
      </Card>

      <Card title="Pending approvals">
        <QueryState query={pending} empty="No posts are waiting for approval.">
          {(data) => (
            <DataTable
              tableId="timeline-pending-approvals"
              rows={data.posts}
              rowKey={(r) => String(r.id)}
              empty="No posts are waiting for approval."
              onRowClick={(r) => setPostId(String(r.id))}
              columns={[
                { key: 'id', header: 'Post', mono: true, render: (r) => String(r.id).slice(0, 8) },
                { key: 'userId', header: 'Author', mono: true, render: (r) => String(r.userId).slice(0, 8) },
                {
                  key: 'content',
                  header: 'Content',
                  render: (r) => String(r.content ?? '').slice(0, 140) || '(no text)',
                },
                { key: 'createdAt', header: 'Held since', render: (r) => new Date(String(r.createdAt)).toLocaleString() },
              ]}
            />
          )}
        </QueryState>
      </Card>

      <Card title="Decide a held post">
        <Stack spacing={2} sx={{ maxWidth: 560 }}>
          <Alert severity="info">
            Click a pending post above to fill its id, or paste an id from an approval
            webhook/flow notification.
          </Alert>
          <TextField
            label="Post ID"
            value={postId}
            onChange={(e) => setPostId(e.target.value)}
            placeholder="uuid of the held post"
          />
          <TextField select label="Decision" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
            <MenuItem value="approved">Approve — restore requested visibility</MenuItem>
            <MenuItem value="rejected">Reject — keep the post hidden</MenuItem>
          </TextField>
          <TextField
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            minRows={2}
          />
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              disabled={!postId.trim()}
              onClick={() =>
                timelineAdminApi
                  .post(postId.trim())
                  .then(setPreview)
                  .catch((e) => onToast((e as Error).message))
              }
            >
              Preview post
            </Button>
            <Button
              variant="contained"
              color={decision === 'approved' ? 'primary' : 'error'}
              disabled={!postId.trim() || decide.isPending}
              onClick={() => decide.mutate()}
            >
              Submit decision
            </Button>
          </Stack>
        </Stack>
      </Card>
      <JsonDialog open={preview != null} title="Post" value={preview} onClose={() => setPreview(null)} />
    </Stack>
  );
}

/* ----------------------------------------------------------------- queues */

function jobRows(d: { jobs?: Job[]; data?: Job[] }): Job[] {
  return d.jobs ?? d.data ?? [];
}

function QueuesTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [queue, setQueue] = useState('');
  const [status, setStatus] = useState('waiting');
  const stats = useQuery({ queryKey: ['timeline', 'jobs', 'stats'], queryFn: timelineJobsApi.stats });
  const queues = Object.keys(asQueueMap(stats.data));
  const activeQueue = queue || queues[0] || '';

  const jobs = useQuery({
    queryKey: ['timeline', 'jobs', activeQueue, status],
    queryFn: () => timelineJobsApi.jobs(activeQueue, { status, limit: 50 }),
    enabled: !!activeQueue,
  });

  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn()
      .then(() => {
        onToast(msg);
        qc.invalidateQueries({ queryKey: ['timeline', 'jobs'] });
      })
      .catch((e) => onToast((e as Error).message));

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
                      <Tooltip title="Pause"><IconButton aria-label="Pause" size="small" onClick={() => act(() => timelineJobsApi.pause(name), `Paused ${name}`)}><PauseIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Resume"><IconButton aria-label="Resume" size="small" onClick={() => act(() => timelineJobsApi.resume(name), `Resumed ${name}`)}><PlayArrowIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Clean completed (>1h)"><IconButton aria-label="Clean completed (>1h)" size="small" onClick={() => act(() => timelineJobsApi.clean(name), `Cleaned ${name}`)}><CleaningServicesIcon fontSize="small" /></IconButton></Tooltip>
                    </Stack>
                  }
                >
                  <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                    {[...JOB_STATES, 'paused'].map((k) => (
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
                tableId="timeline-jobs"
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
                    locked: true,
                    render: (j) => (
                      <>
                        <Tooltip title="Retry"><IconButton aria-label="Retry" size="small" onClick={() => act(() => timelineJobsApi.retry(activeQueue, String(j.id)), 'Retried')}><ReplayIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Remove"><IconButton aria-label="Remove" size="small" color="error" onClick={() => act(() => timelineJobsApi.remove(activeQueue, String(j.id)), 'Removed')}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
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

/* ------------------------------------------------------------------- page */

type TimelineTab = 'overview' | 'approvals' | 'queues' | 'config';

export function TimelineSection() {
  const [tab, setTab] = useState<TimelineTab>('overview');
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Timeline" subtitle="Posts, approval pipeline, job queues — /timeline/api" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab value="overview" label="Overview" />
        <Tab value="approvals" label="Approvals" />
        <Tab value="queues" label="Job queues" />
        <Tab value="config" label="Config" />
      </Tabs>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'approvals' && <ApprovalsTab onToast={showToast} />}
      {tab === 'queues' && <QueuesTab onToast={showToast} />}
      {tab === 'config' && (
        <ConfigSectionEditor
          sections={TIMELINE_CONFIG_SECTIONS}
          load={(s) => timelineConfigApi.getConfigSection(s)}
          save={(s, data) => timelineConfigApi.saveConfigSection(s, data)}
        />
      )}
      {ToastHost}
    </Stack>
  );
}
