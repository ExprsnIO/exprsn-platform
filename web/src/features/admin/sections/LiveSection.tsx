import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import DeleteIcon from '@mui/icons-material/Delete';
import { liveApi } from '@/api/live';
import { liveAdminApi, LIVE_CONFIG_SECTIONS, type Stream, type Room, type Destination } from '@/api/admin/live';
import { formatDate } from '@/features/files/util';
import { Card, ConfigSectionEditor, DataTable, JsonDialog, QueryState, SectionHeader, StatCard, StatusChip, useToast } from '../ui';

function arr<T>(d: Record<string, unknown>, ...keys: string[]): T[] {
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as T[];
  return [];
}

/* --------------------------------------------------------------- streams */

function CreateStreamDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
  const mut = useMutation({
    mutationFn: () => liveApi.createStream({ title, visibility }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['live', 'streams'] }); onDone('Stream created'); onClose(); setTitle(''); },
    onError: (e) => onDone((e as Error).message),
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Create stream</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextField select label="Visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
            {['public', 'unlisted', 'private'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!title || mut.isPending} onClick={() => mut.mutate()}>Create</Button>
      </DialogActions>
    </Dialog>
  );
}

function StreamsTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Stream | null>(null);
  const query = useQuery({ queryKey: ['live', 'streams', statusFilter], queryFn: () => liveAdminApi.listStreams({ status: statusFilter || undefined, limit: 100 }) });
  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { onToast(msg); qc.invalidateQueries({ queryKey: ['live', 'streams'] }); }).catch((e) => onToast((e as Error).message));
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
        <TextField select size="small" label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 160 }}>
          {['', 'pending', 'live', 'ended', 'error'].map((s) => <MenuItem key={s} value={s}>{s || 'all'}</MenuItem>)}
        </TextField>
        <Button variant="contained" onClick={() => setOpen(true)}>Create stream</Button>
      </Stack>
      <QueryState query={query} empty="No streams.">
        {(d) => (
          <DataTable
            rows={arr<Stream>(d, 'streams', 'data')}
            rowKey={(s) => s.id}
            columns={[
              { key: 'title', header: 'Title' },
              { key: 'status', header: 'Status', render: (s) => <StatusChip status={s.status} /> },
              { key: 'visibility', header: 'Visibility', render: (s) => s.visibility ?? '—' },
              { key: 'viewers', header: 'Viewers', align: 'right', render: (s) => s.currentViewers ?? s.viewer_count ?? 0 },
              { key: 'created_at', header: 'Created', render: (s) => formatDate(s.created_at) },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (s) => (
                  <>
                    <Tooltip title="Start"><span><IconButton size="small" aria-label="Start" disabled={s.status === 'live'} onClick={() => act(() => liveAdminApi.startStream(s.id), 'Started')}><PlayArrowIcon fontSize="small" /></IconButton></span></Tooltip>
                    <Tooltip title="Stop"><span><IconButton size="small" aria-label="Stop" disabled={s.status !== 'live'} onClick={() => act(() => liveAdminApi.stopStream(s.id), 'Stopped')}><StopIcon fontSize="small" /></IconButton></span></Tooltip>
                    <Tooltip title="Details"><IconButton aria-label="Details" size="small" onClick={() => setView(s)}>…</IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton aria-label="Delete" size="small" color="error" onClick={() => { if (confirm(`Delete “${s.title}”?`)) act(() => liveAdminApi.deleteStream(s.id), 'Deleted'); }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                  </>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <CreateStreamDialog open={open} onClose={() => setOpen(false)} onDone={onToast} />
      <JsonDialog open={!!view} title={view?.title ?? 'Stream'} value={view} onClose={() => setView(null)} />
    </Stack>
  );
}

/* ----------------------------------------------------------------- rooms */

function RoomsTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['live', 'rooms'], queryFn: () => liveAdminApi.listRooms({ limit: 100 }) });
  const del = (id: string) => liveAdminApi.deleteRoom(id).then(() => { onToast('Room closed'); qc.invalidateQueries({ queryKey: ['live', 'rooms'] }); }).catch((e) => onToast((e as Error).message));
  return (
    <QueryState query={query} empty="No rooms.">
      {(d) => (
        <DataTable
          rows={arr<Room>(d, 'rooms', 'data')}
          rowKey={(r) => r.id}
          columns={[
            { key: 'name', header: 'Name', render: (r) => r.name ?? '—' },
            { key: 'code', header: 'Code', mono: true, render: (r) => r.code ?? '—' },
            { key: 'status', header: 'Status', render: (r) => <StatusChip status={r.status} /> },
            { key: 'private', header: 'Private', render: (r) => (r.isPrivate ? 'yes' : 'no') },
            { key: 'participants', header: 'Participants', align: 'right', render: (r) => `${r.participantCount ?? 0}/${r.maxParticipants ?? '—'}` },
            { key: 'del', header: '', align: 'right', render: (r) => <Tooltip title="Close room"><IconButton aria-label="Close room" size="small" color="error" onClick={() => del(r.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip> },
          ]}
        />
      )}
    </QueryState>
  );
}

/* ---------------------------------------------------- destinations / simulcast */

function DestinationsTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [streamId, setStreamId] = useState('');
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  const query = useQuery({ queryKey: ['live', 'destinations', streamId], queryFn: () => liveAdminApi.listDestinations({ stream_id: streamId || undefined }) });

  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { onToast(msg); qc.invalidateQueries({ queryKey: ['live', 'destinations'] }); }).catch((e) => onToast((e as Error).message));

  return (
    <Stack spacing={2}>
      <Card title="Simulcast control">
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          <TextField size="small" label="Stream ID" value={streamId} onChange={(e) => setStreamId(e.target.value)} sx={{ minWidth: 300 }} />
          <Button size="small" variant="outlined" disabled={!streamId} onClick={() => act(() => liveAdminApi.simulcastStart(streamId), 'Simulcast started')}>Start</Button>
          <Button size="small" variant="outlined" color="error" disabled={!streamId} onClick={() => act(() => liveAdminApi.simulcastStop(streamId), 'Simulcast stopped')}>Stop</Button>
          <Button size="small" disabled={!streamId} onClick={() => liveAdminApi.simulcastStatus(streamId).then((v) => setView({ title: 'Simulcast status', value: v })).catch((e) => onToast((e as Error).message))}>Status</Button>
        </Stack>
      </Card>
      <Card title="Destinations">
        <QueryState query={query} empty="No destinations (filter by stream id, or leave blank for all your destinations).">
          {(d) => (
            <DataTable
              rows={arr<Destination>(d, 'destinations', 'data')}
              rowKey={(x) => x.id}
              columns={[
                { key: 'platform', header: 'Platform', render: (x) => x.platform ?? '—' },
                { key: 'name', header: 'Name', render: (x) => x.name ?? '—' },
                { key: 'enabled', header: 'Enabled', render: (x) => (x.is_enabled ? 'yes' : 'no') },
                { key: 'status', header: 'Status', render: (x) => <StatusChip status={x.status} /> },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (x) => (
                    <>
                      <Button size="small" onClick={() => liveAdminApi.testDestination(x.id).then((v) => setView({ title: 'Test connection', value: v })).catch((e) => onToast((e as Error).message))}>Test</Button>
                      <Tooltip title="Delete"><IconButton aria-label="Delete" size="small" color="error" onClick={() => act(() => liveAdminApi.deleteDestination(x.id), 'Destination deleted')}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                    </>
                  ),
                },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </Stack>
  );
}

/* --------------------------------------------------------------- workers */

function WorkersTab() {
  // ffmpeg fanout + recording queue depths (RabbitMQ). Poll every 5s.
  const query = useQuery({
    queryKey: ['live', 'workers'],
    queryFn: liveAdminApi.workersStats,
    refetchInterval: 5000,
  });
  return (
    <QueryState query={query} empty="No worker stats.">
      {(d) => {
        const queues = d.queues;
        if (!queues || queues.enabled === false) {
          return <Alert severity="info">RabbitMQ disabled — ffmpeg fanout/recording queues are not running.</Alert>;
        }
        return (
          <Stack spacing={2}>
            <Card title="ffmpeg fanout queue">
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                <StatCard label="Depth" value={queues.fanout?.depth ?? 0} hint="Pending fanout jobs" />
                <StatCard label="Dead-letter" value={queues.fanout?.dlq ?? 0} hint="Failed fanout jobs" />
              </Stack>
            </Card>
            <Card title="Recording queue">
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                <StatCard label="Depth" value={queues.recording?.depth ?? 0} hint="Pending recording jobs" />
                <StatCard label="Dead-letter" value={queues.recording?.dlq ?? 0} hint="Failed recording jobs" />
              </Stack>
            </Card>
          </Stack>
        );
      }}
    </QueryState>
  );
}

/* ------------------------------------------------------------------- page */

type LiveTab = 'streams' | 'rooms' | 'destinations' | 'workers' | 'config';

export function LiveSection() {
  const [tab, setTab] = useState<LiveTab>('streams');
  const { showToast, ToastHost } = useToast();
  const stats = useQuery({ queryKey: ['live', 'stats'], queryFn: liveAdminApi.stats });
  // Shape: { success, stats: { connections, streams, rooms, totalViewers, totalParticipants } }
  const raw = (stats.data ?? {}) as Record<string, unknown>;
  const s = ((raw.stats as Record<string, unknown>) ?? raw) as Record<string, unknown>;
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Live Streaming" subtitle="Streams, rooms, simulcast destinations — /live/api" />
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <StatCard label="Streams" value={(s.streams ?? s.totalStreams) as number} />
        <StatCard label="Rooms" value={(s.rooms ?? s.activeRooms) as number} />
        <StatCard label="Viewers" value={(s.totalViewers ?? s.viewers) as number} />
        <StatCard label="Participants" value={(s.totalParticipants ?? s.participants) as number} />
        <StatCard label="Connections" value={s.connections as number} />
      </Stack>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab value="streams" label="Streams" />
        <Tab value="rooms" label="Rooms" />
        <Tab value="destinations" label="Destinations / Simulcast" />
        <Tab value="workers" label="Workers" />
        <Tab value="config" label="Config" />
      </Tabs>
      {tab === 'streams' && <StreamsTab onToast={showToast} />}
      {tab === 'rooms' && <RoomsTab onToast={showToast} />}
      {tab === 'destinations' && <DestinationsTab onToast={showToast} />}
      {tab === 'workers' && <WorkersTab />}
      {tab === 'config' && <ConfigSectionEditor sections={LIVE_CONFIG_SECTIONS} load={(sec) => liveAdminApi.getConfigSection(sec)} save={(sec, data) => liveAdminApi.saveConfigSection(sec, data)} />}
      {ToastHost}
    </Stack>
  );
}
