import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VisibilityIcon from '@mui/icons-material/Visibility';
import LiveTvIcon from '@mui/icons-material/LiveTv';
import { useAppStore } from '@/app/store';
import { toMessage } from '@/lib/errors';
import { liveApi, playableHlsUrl, type Stream } from '@/api/live';
import { HlsPlayer } from './HlsPlayer';
import { RecordingsList } from './RecordingsList';

const STREAMS_KEY = ['live', 'streams'] as const;

function statusChip(s: Stream) {
  const live = s.isLive || s.status === 'live';
  return (
    <Chip
      size="small"
      color={live ? 'error' : s.status === 'pending' ? 'warning' : 'default'}
      label={live ? '● LIVE' : s.status ?? 'idle'}
    />
  );
}

/** Split an SRS rtmp_url (rtmp://host:1935/live/<key>) into server + key for OBS. */
function ingestParts(rtmpUrl?: string): { server: string; key: string } | null {
  if (!rtmpUrl) return null;
  const idx = rtmpUrl.lastIndexOf('/');
  if (idx < 0) return null;
  return { server: rtmpUrl.slice(0, idx), key: rtmpUrl.slice(idx + 1) };
}

function StreamDetail({
  stream,
  onBack,
  onToast,
}: {
  stream: Stream;
  onBack: () => void;
  onToast: (m: string) => void;
}) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: [...STREAMS_KEY, stream.id],
    queryFn: () => liveApi.getStream(stream.id),
    initialData: { success: true, stream },
    refetchInterval: 5000,
  });
  const s = detail.data?.stream ?? stream;

  const refresh = () => qc.invalidateQueries({ queryKey: STREAMS_KEY });
  const startM = useMutation({
    mutationFn: () => liveApi.startStream(s.id),
    onSuccess: () => { onToast('Stream started'); refresh(); },
    onError: (e) => onToast(toMessage(e)),
  });
  const stopM = useMutation({
    mutationFn: () => liveApi.stopStream(s.id),
    onSuccess: () => { onToast('Stream stopped'); refresh(); },
    onError: (e) => onToast(toMessage(e)),
  });

  const recordings = useQuery({
    queryKey: [...STREAMS_KEY, stream.id, 'recordings'],
    queryFn: () => liveApi.getStreamRecordings(stream.id),
  });

  const ingest = ingestParts(s.rtmp_url);
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => onToast('Copied'), () => onToast('Copy failed'));
  const live = s.isLive || s.status === 'live';

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <IconButton size="small" aria-label="Back" onClick={onBack}><ArrowBackIcon /></IconButton>
        <Typography variant="h6">{s.title}</Typography>
        {statusChip(s)}
        <Box sx={{ flex: 1 }} />
        {live ? (
          <Button size="small" color="error" variant="outlined" startIcon={<StopIcon />} disabled={stopM.isPending} onClick={() => stopM.mutate()}>Stop</Button>
        ) : (
          <Button size="small" variant="contained" startIcon={<PlayArrowIcon />} disabled={startM.isPending} onClick={() => startM.mutate()}>Go live</Button>
        )}
      </Stack>

      <HlsPlayer src={playableHlsUrl(s.hls_url)} />

      <Typography variant="caption" color="text.secondary">
        {s.currentViewers ?? s.viewer_count ?? 0} watching{s.is_recording ? ' · recording' : ''}
      </Typography>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Stream to this with OBS (or any RTMP encoder)</Typography>
        {ingest ? (
          <Stack spacing={1}>
            <Field label="Server" value={ingest.server} onCopy={copy} />
            <Field label="Stream key" value={ingest.key} onCopy={copy} secret />
            <Divider />
            <Field label="Playback (HLS)" value={s.hls_url ?? ''} onCopy={copy} />
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">No ingest URL available.</Typography>
        )}
      </Paper>

      {(recordings.data?.recordings?.length ?? 0) > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>Recordings</Typography>
          <RecordingsList recordings={recordings.data?.recordings ?? []} />
        </Paper>
      )}
    </Stack>
  );
}

function Field({ label, value, onCopy, secret }: { label: string; value: string; onCopy: (v: string) => void; secret?: boolean }) {
  const [show, setShow] = useState(false);
  const display = secret && !show ? '•'.repeat(Math.min(value.length, 24)) : value;
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="caption" sx={{ width: 110, color: 'text.secondary', flexShrink: 0 }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{display}</Typography>
      {secret && (
        <Button size="small" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</Button>
      )}
      <Tooltip title="Copy"><IconButton aria-label="Copy" size="small" onClick={() => onCopy(value)}><ContentCopyIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
    </Stack>
  );
}

/**
 * Browse streams that are live right now (public + unlisted). Clicking a card
 * opens the public watch experience (player + chat + presence).
 */
function DiscoverGrid({ onWatch }: { onWatch: (s: Stream) => void }) {
  const query = useQuery({
    queryKey: [...STREAMS_KEY, 'discover'],
    queryFn: () => liveApi.listStreams({ status: 'live', limit: 50 }),
    refetchInterval: 15000,
  });

  if (query.isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={28} /></Box>;
  }
  if (query.isError) return <Alert severity="error">{toMessage(query.error)}</Alert>;

  // Don't surface private streams in discovery even if the API returns them.
  const streams = (query.data?.streams ?? []).filter((s) => s.visibility !== 'private');

  if (streams.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
        <LiveTvIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
        <Typography color="text.secondary">No one is live right now. Check back soon.</Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' } }}>
      {streams.map((s) => (
        <Paper
          key={s.id}
          variant="outlined"
          sx={{ overflow: 'hidden', cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}
          onClick={() => onWatch(s)}
        >
          <Box sx={{ position: 'relative', aspectRatio: '16 / 9', bgcolor: 'common.black' }}>
            {s.thumbnail_url ? (
              <Box component="img" src={s.thumbnail_url} alt={s.title} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LiveTvIcon sx={{ fontSize: 48, color: 'grey.700' }} />
              </Box>
            )}
            <Chip size="small" color="error" label="● LIVE" sx={{ position: 'absolute', top: 8, left: 8 }} />
            <Chip
              size="small"
              icon={<VisibilityIcon />}
              label={s.currentViewers ?? s.viewer_count ?? 0}
              sx={{ position: 'absolute', bottom: 8, right: 8, bgcolor: 'color-mix(in srgb, var(--exprsn-black) 60%, transparent)', color: 'common.white' }}
            />
          </Box>
          <Box sx={{ p: 1.5 }}>
            <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>{s.title}</Typography>
            {s.description && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {s.description}
              </Typography>
            )}
          </Box>
        </Paper>
      ))}
    </Box>
  );
}

/**
 * Phase 5 — Live streaming. A "Browse" tab discovers streams that are live now
 * (opening the public watch page), and a "My streams" tab is the owner console:
 * create streams, grab the RTMP ingest details for OBS, start/stop, and delete.
 * Ingest is served by the configured provider (self-hosted SRS or Cloudflare).
 */
export function StreamsPage() {
  const userId = useAppStore((s) => s.user?.id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'browse' | 'mine'>('browse');
  const [selected, setSelected] = useState<Stream | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '' });
  const [toast, setToast] = useState<string | null>(null);

  const mineKey = [...STREAMS_KEY, 'mine', userId] as const;
  const query = useQuery({
    queryKey: mineKey,
    queryFn: () => liveApi.listStreams({ userId }),
    enabled: !!userId && tab === 'mine',
  });

  const createM = useMutation({
    mutationFn: () => liveApi.createStream({ title: form.title.trim(), description: form.description.trim() || undefined }),
    onSuccess: (res) => {
      setDialogOpen(false);
      setForm({ title: '', description: '' });
      qc.invalidateQueries({ queryKey: mineKey });
      if (res.stream) setSelected(res.stream);
    },
    onError: (e) => setToast(toMessage(e)),
  });
  const deleteM = useMutation({
    mutationFn: (s: Stream) => liveApi.deleteStream(s.id),
    onSuccess: () => { setToast('Stream deleted'); qc.invalidateQueries({ queryKey: mineKey }); },
    onError: (e) => setToast(toMessage(e)),
  });

  if (!userId) return <Alert severity="error">Not signed in.</Alert>;
  const streams = query.data?.streams ?? [];

  return (
    <Stack spacing={2} sx={{ maxWidth: 1100, mx: 'auto', pb: 6 }}>
      {selected ? (
        <StreamDetail stream={selected} onBack={() => setSelected(null)} onToast={setToast} />
      ) : (
        <>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h5" component="h1">Live</Typography>
            <Box sx={{ flex: 1 }} />
            {tab === 'mine' && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>New stream</Button>
            )}
          </Stack>

          <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tab value="browse" label="Browse" />
            <Tab value="mine" label="My streams" />
          </Tabs>

          {tab === 'browse' && <DiscoverGrid onWatch={(s) => navigate(`/streams/watch/${s.id}`)} />}

          {tab === 'mine' && (
            <Stack spacing={2}>
              {query.isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={28} /></Box>}
              {query.isError && <Alert severity="error">{toMessage(query.error)}</Alert>}
              {query.isSuccess && streams.length === 0 && (
                <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
                  <Typography color="text.secondary">No streams yet. Create one to get your RTMP ingest details.</Typography>
                </Paper>
              )}

              {streams.map((s) => (
                <Paper key={s.id} variant="outlined" sx={{ p: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setSelected(s)}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{s.title}</Typography>
                        {statusChip(s)}
                      </Stack>
                      {s.description && <Typography variant="body2" color="text.secondary">{s.description}</Typography>}
                    </Box>
                    <Tooltip title="Watch">
                      <IconButton aria-label="Watch" size="small" onClick={() => navigate(`/streams/watch/${s.id}`)}><VisibilityIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Button size="small" onClick={() => setSelected(s)}>Manage</Button>
                    <Tooltip title="Delete">
                      <IconButton aria-label="Delete" size="small" color="error" onClick={() => { if (window.confirm(`Delete "${s.title}"?`)) deleteM.mutate(s); }}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New stream</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {createM.isError && <Alert severity="error">{toMessage(createM.error)}</Alert>}
            <TextField label="Title" required fullWidth value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <TextField label="Description" fullWidth multiline minRows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={form.title.trim().length === 0 || createM.isPending} onClick={() => createM.mutate()}>
            {createM.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Stack>
  );
}
