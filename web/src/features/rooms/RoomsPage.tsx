import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import CallEndIcon from '@mui/icons-material/CallEnd';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useAppStore } from '@/app/store';
import { toMessage } from '@/lib/errors';
import { roomApi, type Room } from '@/api/live';
import { useWebRtcRoom } from './useWebRtcRoom';
import { VideoTile } from './VideoTile';

interface ActiveRoom {
  room: Room;
  password?: string;
}

function Lobby({ onEnter }: { onEnter: (r: ActiveRoom) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { room } = await roomApi.createRoom({ name: name.trim() });
      onEnter({ room });
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { room } = await roomApi.getRoomByCode(code.trim());
      onEnter({ room });
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 560 }}>
      <Box>
        <Typography variant="h5" gutterBottom>
          Video rooms
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Start a new video chat or join one with a room code. Your camera and
          microphone stay peer-to-peer (WebRTC); only signaling passes through the
          server, which requires you to be signed in.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          Start a new room
        </Typography>
        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="Room name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            disabled={busy}
          />
          <Button
            variant="contained"
            startIcon={<VideoCallIcon />}
            onClick={create}
            disabled={busy || !name.trim()}
          >
            Create
          </Button>
        </Stack>
      </Paper>

      <Divider>or</Divider>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          Join with a code
        </Typography>
        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="Room code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && join()}
            disabled={busy}
          />
          <Button variant="outlined" onClick={join} disabled={busy || !code.trim()}>
            Join
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}

function RoomView({ active, onLeave }: { active: ActiveRoom; onLeave: () => void }) {
  const user = useAppStore((s) => s.user);
  const displayName = user?.displayName || user?.firstName || user?.email || 'You';

  const {
    status,
    error,
    localStream,
    peers,
    audioEnabled,
    videoEnabled,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    leave,
  } = useWebRtcRoom(active.room.id, { displayName, password: active.password });

  const handleLeave = () => {
    leave();
    onLeave();
  };

  const copyCode = () => {
    void navigator.clipboard?.writeText(active.room.room_code);
  };

  // Local tile + one tile per remote peer.
  const tileCount = peers.length + 1;
  const cols = useMemo(() => Math.min(3, Math.ceil(Math.sqrt(tileCount))), [tileCount]);

  return (
    <Stack spacing={2} sx={{ height: '100%' }}>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
        <Typography variant="h6">{active.room.name}</Typography>
        <Chip
          size="small"
          label={`Code: ${active.room.room_code}`}
          onDelete={copyCode}
          deleteIcon={
            <Tooltip title="Copy code">
              <ContentCopyIcon />
            </Tooltip>
          }
        />
        <Box flexGrow={1} />
        {status === 'connecting' && <CircularProgress size={20} />}
        <Chip
          size="small"
          color={status === 'connected' ? 'success' : status === 'error' ? 'error' : 'default'}
          label={status}
        />
        <Chip size="small" variant="outlined" label={`${tileCount} in room`} />
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Box
        sx={{
          flexGrow: 1,
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          alignContent: 'start',
        }}
      >
        <VideoTile
          stream={localStream}
          label={`${displayName} (you)${isScreenSharing ? ' · sharing' : ''}`}
          muted
          mirrored={!isScreenSharing}
          audioEnabled={audioEnabled}
          videoEnabled={isScreenSharing ? true : videoEnabled}
        />
        {peers.map((p) => (
          <VideoTile
            key={p.socketId}
            stream={p.stream ?? null}
            label={p.displayName || 'Participant'}
            audioEnabled={p.isAudioEnabled}
            videoEnabled={p.isVideoEnabled}
          />
        ))}
      </Box>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={2} justifyContent="center">
          <Tooltip title={audioEnabled ? 'Mute' : 'Unmute'}>
            <IconButton color={audioEnabled ? 'default' : 'error'} onClick={toggleAudio}>
              {audioEnabled ? <MicIcon /> : <MicOffIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title={videoEnabled ? 'Turn camera off' : 'Turn camera on'}>
            <IconButton color={videoEnabled ? 'default' : 'error'} onClick={toggleVideo}>
              {videoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}>
            <IconButton color={isScreenSharing ? 'primary' : 'default'} onClick={() => void toggleScreenShare()}>
              {isScreenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Leave room">
            <IconButton color="error" onClick={handleLeave}>
              <CallEndIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>
    </Stack>
  );
}

export function RoomsPage() {
  const [active, setActive] = useState<ActiveRoom | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [joinError, setJoinError] = useState<string | null>(null);
  const autoJoined = useRef(false);

  // Deep-link join: a chat "Join call" card navigates to /rooms?join=<code>.
  // Resolve the room by code and enter it once.
  useEffect(() => {
    const code = searchParams.get('join');
    if (!code || autoJoined.current || active) return;
    autoJoined.current = true;
    roomApi
      .getRoomByCode(code.trim())
      .then(({ room }) => setActive({ room }))
      .catch((e) => setJoinError(toMessage(e)))
      .finally(() => {
        searchParams.delete('join');
        setSearchParams(searchParams, { replace: true });
      });
  }, [searchParams, active, setSearchParams]);

  return (
    <Box sx={{ height: '100%' }}>
      {joinError && !active && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setJoinError(null)}>
          {joinError}
        </Alert>
      )}
      {active ? (
        <RoomView active={active} onLeave={() => setActive(null)} />
      ) : (
        <Lobby onEnter={setActive} />
      )}
    </Box>
  );
}
