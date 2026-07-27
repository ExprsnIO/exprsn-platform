import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useAppStore } from '@/app/store';
import { toMessage } from '@/lib/errors';
import { liveApi, playableHlsUrl, type Stream } from '@/api/live';
import { HlsPlayer } from './HlsPlayer';
import { StreamChat } from './StreamChat';
import { RecordingsList } from './RecordingsList';
import { useStreamRealtime } from './useStreamRealtime';

const KEY = ['live', 'streams'] as const;

function liveBadge(s: Stream) {
  const live = s.isLive || s.status === 'live';
  return <Chip size="small" color={live ? 'error' : 'default'} label={live ? '● LIVE' : s.status ?? 'offline'} />;
}

/**
 * Public viewer experience for a single stream: HLS playback, realtime viewer
 * count + live chat (driven by the /live socket), and past recordings. Distinct
 * from StreamsPage, which is the owner's management/ingest console.
 */
export function WatchPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const userId = useAppStore((s) => s.user?.id);

  const streamQ = useQuery({
    queryKey: [...KEY, id],
    queryFn: () => liveApi.getStream(id),
    enabled: !!id,
    refetchInterval: 15000,
  });
  const recordingsQ = useQuery({
    queryKey: [...KEY, id, 'recordings'],
    queryFn: () => liveApi.getStreamRecordings(id),
    enabled: !!id,
  });

  const { viewerCount, messages, canChat, chatError, sendMessage } = useStreamRealtime(id || null);

  if (streamQ.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }
  if (streamQ.isError) return <Alert severity="error">{toMessage(streamQ.error)}</Alert>;

  const s = streamQ.data?.stream;
  if (!s) return <Alert severity="warning">Stream not found.</Alert>;

  const recordings = recordingsQ.data?.recordings ?? [];
  // Prefer the realtime count; fall back to the polled snapshot.
  const watching = viewerCount ?? s.currentViewers ?? s.viewer_count ?? 0;

  return (
    <Box sx={{ pb: 6 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <IconButton size="small" aria-label="Back to streams" onClick={() => navigate('/streams')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" component="h1" sx={{ flexShrink: 1, minWidth: 0 }} noWrap>
          {s.title}
        </Typography>
        {liveBadge(s)}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Watching now">
          <Chip size="small" variant="outlined" icon={<VisibilityIcon />} label={watching} />
        </Tooltip>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 340px' },
          alignItems: 'start',
        }}
      >
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <HlsPlayer src={playableHlsUrl(s.hls_url)} />
          {s.description && (
            <Typography variant="body2" color="text.secondary">
              {s.description}
            </Typography>
          )}
          {recordings.length > 0 && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Recordings
              </Typography>
              <RecordingsList recordings={recordings} />
            </Box>
          )}
        </Stack>

        <Box sx={{ height: { xs: 420, md: 'calc(100vh - 220px)' }, position: { md: 'sticky' }, top: 16 }}>
          <StreamChat
            messages={messages}
            canChat={canChat}
            chatError={chatError}
            onSend={sendMessage}
            currentUserId={userId}
          />
        </Box>
      </Box>
    </Box>
  );
}
