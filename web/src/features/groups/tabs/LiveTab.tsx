import { useState, type ReactNode } from 'react';
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
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
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
import LinkIcon from '@mui/icons-material/Link';
import LiveTvOutlinedIcon from '@mui/icons-material/LiveTvOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import {
  liveApi,
  playableHlsUrl,
  type CreateGroupStreamInput,
  type Stream,
} from '@/api/live';
import { nexusApi } from '@/api/nexus';
import { isHttpError, toMessage } from '@/lib/errors';
import { HlsPlayer } from '@/features/streams/HlsPlayer';
import type { GroupTabProps } from './types';

const VISIBILITIES: { value: NonNullable<CreateGroupStreamInput['visibility']>; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'private', label: 'Members only' },
];

function streamsKey(groupId: string) {
  return ['live', 'group-streams', groupId] as const;
}

function isLiveStream(s: Stream): boolean {
  return Boolean(s.isLive || s.status === 'live');
}

function statusChip(s: Stream) {
  const live = isLiveStream(s);
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

function Field({
  label,
  value,
  onCopy,
  secret,
}: {
  label: string;
  value: string;
  onCopy: (v: string) => void;
  secret?: boolean;
}) {
  const [show, setShow] = useState(false);
  const display = secret && !show ? '•'.repeat(Math.min(value.length, 24)) : value;
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="caption" sx={{ width: 110, color: 'text.secondary', flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>
        {display}
      </Typography>
      {secret && (
        <Button size="small" onClick={() => setShow((v) => !v)}>
          {show ? 'Hide' : 'Show'}
        </Button>
      )}
      <Tooltip title="Copy">
        <IconButton size="small" onClick={() => onCopy(value)}>
          <ContentCopyIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

function AttachEventDialog({
  groupId,
  stream,
  open,
  onClose,
  onToast,
}: {
  groupId: string;
  stream: Stream;
  open: boolean;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const events = useQuery({
    queryKey: ['nexus', 'events', groupId],
    queryFn: () => nexusApi.listGroupEvents(groupId, { upcoming: true, limit: 50 }),
    enabled: open,
  });
  const attachM = useMutation({
    mutationFn: (eventId: string) => nexusApi.setEventLiveStream(eventId, stream.id),
    onSuccess: () => {
      onToast('Stream attached to event');
      onClose();
    },
    onError: (e) => onToast(toMessage(e)),
  });

  const list = events.data?.events ?? [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Attach to an event</DialogTitle>
      <DialogContent>
        {events.isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {events.isError && <Alert severity="error">{toMessage(events.error)}</Alert>}
        {events.isSuccess && list.length === 0 && (
          <Typography color="text.secondary" sx={{ py: 2 }}>
            No upcoming events to attach this stream to.
          </Typography>
        )}
        <Stack spacing={1} sx={{ mt: 1 }}>
          {list.map((e) => (
            <Paper key={e.id} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                  {e.title}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={attachM.isPending}
                  onClick={() => attachM.mutate(e.id)}
                >
                  Attach
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function StreamDetail({
  groupId,
  stream,
  canGoLive,
  onBack,
  onToast,
}: {
  groupId: string;
  stream: Stream;
  canGoLive: boolean;
  onBack: () => void;
  onToast: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [attachOpen, setAttachOpen] = useState(false);
  const detail = useQuery({
    queryKey: ['live', 'stream', stream.id],
    queryFn: () => liveApi.getStream(stream.id),
    initialData: { success: true, stream },
    refetchInterval: 5000,
  });
  const s = detail.data?.stream ?? stream;

  const refresh = () => qc.invalidateQueries({ queryKey: streamsKey(groupId) });
  const startM = useMutation({
    mutationFn: () => liveApi.startStream(s.id),
    onSuccess: () => {
      onToast('Stream started');
      refresh();
      detail.refetch();
    },
    onError: (e) => onToast(toMessage(e)),
  });
  const stopM = useMutation({
    mutationFn: () => liveApi.stopStream(s.id),
    onSuccess: () => {
      onToast('Stream stopped');
      refresh();
      detail.refetch();
    },
    onError: (e) => onToast(toMessage(e)),
  });

  const ingest = ingestParts(s.rtmp_url);
  const copy = (t: string) =>
    navigator.clipboard.writeText(t).then(
      () => onToast('Copied'),
      () => onToast('Copy failed'),
    );
  const live = isLiveStream(s);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <IconButton size="small" onClick={onBack}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" sx={{ flex: 1, minWidth: 0 }} noWrap>
          {s.title}
        </Typography>
        {statusChip(s)}
        {canGoLive &&
          (live ? (
            <Button
              size="small"
              color="error"
              variant="outlined"
              startIcon={<StopIcon />}
              disabled={stopM.isPending}
              onClick={() => stopM.mutate()}
            >
              Stop
            </Button>
          ) : (
            <Button
              size="small"
              variant="contained"
              startIcon={<PlayArrowIcon />}
              disabled={startM.isPending}
              onClick={() => startM.mutate()}
            >
              Go live
            </Button>
          ))}
      </Stack>

      <HlsPlayer src={playableHlsUrl(s.hls_url)} />

      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" color="text.secondary">
          {s.currentViewers ?? s.viewer_count ?? 0} watching{s.is_recording ? ' · recording' : ''}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {canGoLive && (
          <Button size="small" color="inherit" startIcon={<LinkIcon />} onClick={() => setAttachOpen(true)}>
            Attach to event
          </Button>
        )}
      </Stack>

      {s.description && (
        <Typography variant="body2" color="text.secondary">
          {s.description}
        </Typography>
      )}

      {canGoLive && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Stream to this with OBS (or any RTMP encoder)
          </Typography>
          {ingest ? (
            <Stack spacing={1}>
              <Field label="Server" value={ingest.server} onCopy={copy} />
              <Field label="Stream key" value={ingest.key} onCopy={copy} secret />
              <Divider />
              <Field label="Playback (HLS)" value={s.hls_url ?? ''} onCopy={copy} />
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No ingest URL available.
            </Typography>
          )}
        </Paper>
      )}

      {canGoLive && (
        <AttachEventDialog
          groupId={groupId}
          stream={s}
          open={attachOpen}
          onClose={() => setAttachOpen(false)}
          onToast={onToast}
        />
      )}
    </Stack>
  );
}

function CreateStreamDialog({
  groupId,
  open,
  onClose,
  onCreated,
  onToast,
}: {
  groupId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (s: Stream) => void;
  onToast: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] =
    useState<NonNullable<CreateGroupStreamInput['visibility']>>('private');
  const [isRecording, setIsRecording] = useState(false);

  const reset = () => {
    setTitle('');
    setDescription('');
    setVisibility('private');
    setIsRecording(false);
  };

  // Create then immediately start, so the host gets a live, broadcastable stream.
  const createM = useMutation({
    mutationFn: async () => {
      const res = await liveApi.createGroupStream(groupId, {
        title: title.trim(),
        description: description.trim() || undefined,
        visibility,
        isRecording,
      });
      try {
        const started = await liveApi.startStream(res.stream.id);
        return started.stream ?? res.stream;
      } catch {
        // Stream exists; the host can start it from the detail view.
        return res.stream;
      }
    },
    onSuccess: (stream) => {
      qc.invalidateQueries({ queryKey: streamsKey(groupId) });
      onToast('Stream created — copy the OBS details to go live');
      reset();
      onClose();
      onCreated(stream);
    },
    onError: (e) => onToast(toMessage(e)),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Go live</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {createM.isError && <Alert severity="error">{toMessage(createM.error)}</Alert>}
          <TextField
            label="Title"
            required
            fullWidth
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextField
            label="Description"
            fullWidth
            multiline
            minRows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <TextField
            select
            label="Visibility"
            fullWidth
            value={visibility}
            onChange={(e) =>
              setVisibility(e.target.value as NonNullable<CreateGroupStreamInput['visibility']>)
            }
          >
            {VISIBILITIES.map((v) => (
              <MenuItem key={v.value} value={v.value}>
                {v.label}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={<Switch checked={isRecording} onChange={(e) => setIsRecording(e.target.checked)} />}
            label="Record this stream"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={title.trim().length === 0 || createM.isPending}
          onClick={() => createM.mutate()}
        >
          {createM.isPending ? 'Creating…' : 'Create & go live'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Phase 5 — Live streaming for a group. Members watch group streams via the HLS
 * player; owners/admins (`ctx.can('goLive')`) create + start streams, get the
 * OBS ingest details, stop them, and optionally attach a stream to a scheduled
 * event. The whole tab is gated for private groups by `viewMemberContent`.
 */
export default function LiveTab({ groupId, ctx }: GroupTabProps) {
  const canGoLive = ctx.can('goLive');
  const [selected, setSelected] = useState<Stream | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const isPrivate = ctx.group?.visibility === 'private';
  const locked = isPrivate && !ctx.can('viewMemberContent');

  const query = useQuery({
    queryKey: streamsKey(groupId),
    queryFn: () => liveApi.listGroupStreams(groupId, { limit: 50 }),
    enabled: !locked,
  });

  if (locked) {
    return (
      <Paper variant="outlined" sx={{ p: 4 }}>
        <Stack spacing={1} alignItems="center" sx={{ textAlign: 'center' }}>
          <LockOutlinedIcon color="disabled" sx={{ fontSize: 40 }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Members only
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Live streams in this private group are visible to members only.
          </Typography>
        </Stack>
      </Paper>
    );
  }

  if (selected) {
    return (
      <>
        <StreamDetail
          groupId={groupId}
          stream={selected}
          canGoLive={canGoLive}
          onBack={() => setSelected(null)}
          onToast={setToast}
        />
        <Snackbar
          open={!!toast}
          autoHideDuration={4000}
          onClose={() => setToast(null)}
          message={toast}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        />
      </>
    );
  }

  const streams = query.data?.streams ?? [];

  let body: ReactNode;
  if (query.isLoading) {
    body = (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={26} />
      </Box>
    );
  } else if (query.isError) {
    body = isHttpError(query.error, 403) ? (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        Live streams are visible to group members only.
      </Typography>
    ) : (
      <Alert severity="error">{toMessage(query.error)}</Alert>
    );
  } else if (streams.length === 0) {
    body = (
      <Paper variant="outlined" sx={{ p: 6 }}>
        <Stack spacing={1} alignItems="center" sx={{ textAlign: 'center' }}>
          <LiveTvOutlinedIcon color="disabled" sx={{ fontSize: 40 }} />
          <Typography color="text.secondary">
            {canGoLive
              ? 'No streams yet. Go live to get your OBS ingest details.'
              : 'No live streams yet.'}
          </Typography>
        </Stack>
      </Paper>
    );
  } else {
    body = (
      <Stack spacing={1.5}>
        {streams.map((s) => (
          <Paper key={s.id} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                onClick={() => setSelected(s)}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
                    {s.title}
                  </Typography>
                  {statusChip(s)}
                </Stack>
                {s.description && (
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {s.description}
                  </Typography>
                )}
              </Box>
              <Button size="small" onClick={() => setSelected(s)}>
                {isLiveStream(s) ? 'Watch' : 'Open'}
              </Button>
              {canGoLive && (
                <Tooltip title="Delete">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => {
                      if (window.confirm(`Delete "${s.title}"?`)) {
                        liveApi
                          .deleteStream(s.id)
                          .then(() => {
                            setToast('Stream deleted');
                            query.refetch();
                          })
                          .catch((e) => setToast(toMessage(e)));
                      }
                    }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </Paper>
        ))}
      </Stack>
    );
  }

  return (
    <Stack spacing={1.5}>
      {canGoLive && (
        <Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
          >
            Go live
          </Button>
        </Box>
      )}
      {body}

      <CreateStreamDialog
        groupId={groupId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(s) => setSelected(s)}
        onToast={setToast}
      />
      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Stack>
  );
}
