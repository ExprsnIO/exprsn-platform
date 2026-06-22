import { useState } from 'react';
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
import { useAppStore } from '@/app/store';
import { toMessage } from '@/lib/errors';
import { liveApi, playableHlsUrl, type Stream } from '@/api/live';
import { HlsPlayer } from './HlsPlayer';

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

  const ingest = ingestParts(s.rtmp_url);
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => onToast('Copied'), () => onToast('Copy failed'));
  const live = s.isLive || s.status === 'live';

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <IconButton size="small" onClick={onBack}><ArrowBackIcon /></IconButton>
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
      <Tooltip title="Copy"><IconButton size="small" onClick={() => onCopy(value)}><ContentCopyIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
    </Stack>
  );
}

/**
 * Phase 5 — Live streaming. Create/list streams, view with an HLS player, get
 * the RTMP ingest details for OBS, and start/stop. Ingest is served by the
 * configured provider (self-hosted SRS by default, or Cloudflare Stream).
 */
export function StreamsPage() {
  const userId = useAppStore((s) => s.user?.id);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Stream | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '' });
  const [toast, setToast] = useState<string | null>(null);

  const query = useQuery({ queryKey: STREAMS_KEY, queryFn: liveApi.listStreams });

  const createM = useMutation({
    mutationFn: () => liveApi.createStream({ title: form.title.trim(), description: form.description.trim() || undefined }),
    onSuccess: (res) => {
      setDialogOpen(false);
      setForm({ title: '', description: '' });
      qc.invalidateQueries({ queryKey: STREAMS_KEY });
      if (res.stream) setSelected(res.stream);
    },
    onError: (e) => setToast(toMessage(e)),
  });
  const deleteM = useMutation({
    mutationFn: (s: Stream) => liveApi.deleteStream(s.id),
    onSuccess: () => { setToast('Stream deleted'); qc.invalidateQueries({ queryKey: STREAMS_KEY }); },
    onError: (e) => setToast(toMessage(e)),
  });

  if (!userId) return <Alert severity="error">Not signed in.</Alert>;
  const streams = query.data?.streams ?? [];

  return (
    <Stack spacing={2} sx={{ maxWidth: 820, mx: 'auto', pb: 6 }}>
      {selected ? (
        <StreamDetail stream={selected} onBack={() => setSelected(null)} onToast={setToast} />
      ) : (
        <>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h5">Live</Typography>
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>New stream</Button>
          </Stack>

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
                <Button size="small" onClick={() => setSelected(s)}>Open</Button>
                <Tooltip title="Delete">
                  <IconButton size="small" color="error" onClick={() => { if (window.confirm(`Delete "${s.title}"?`)) deleteM.mutate(s); }}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Paper>
          ))}
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
