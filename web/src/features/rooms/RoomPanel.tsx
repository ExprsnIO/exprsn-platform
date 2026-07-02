import { useMemo, useRef, useState } from 'react';
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
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ImageIcon from '@mui/icons-material/Image';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import { toMessage } from '@/lib/errors';
import {
  roomCollabApi,
  type RecordingQuality,
  type Room,
  type RoomFile,
} from '@/api/live';
import { filevaultApi, type FileItem } from '@/api/filevault';

const PANEL_KEY = ['room-collab'] as const;

/** Human-readable file size. */
function fmtSize(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function fileIcon(mimetype?: string) {
  if (!mimetype) return <InsertDriveFileIcon fontSize="small" />;
  if (mimetype.startsWith('image/')) return <ImageIcon fontSize="small" />;
  if (mimetype.startsWith('video/')) return <VideoFileIcon fontSize="small" />;
  if (mimetype.includes('zip') || mimetype.includes('compressed'))
    return <FolderZipIcon fontSize="small" />;
  return <InsertDriveFileIcon fontSize="small" />;
}

/** A resilient wrapper: host-only endpoints may 403/404; surface a friendly note. */
function accessNote(error: unknown): string | null {
  const status = (error as { status?: number } | null)?.status;
  if (status === 403) return 'Only the room host can manage this.';
  if (status === 404) return 'Not available for this room yet.';
  return null;
}

// ── Files tab ────────────────────────────────────────────────────────────────

function VaultPicker({
  onPick,
  onClose,
  busy,
}: {
  onPick: (file: FileItem) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const query = useQuery({
    queryKey: [...PANEL_KEY, 'vault-files'],
    queryFn: () => filevaultApi.listFiles({ limit: 100 }),
  });
  const files = query.data?.files ?? [];

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Share from Vault</DialogTitle>
      <DialogContent dividers>
        {query.isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {query.isError && <Alert severity="error">{toMessage(query.error)}</Alert>}
        {query.isSuccess && files.length === 0 && (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            No files in your Vault yet.
          </Typography>
        )}
        <List dense>
          {files.map((f) => (
            <ListItemButton key={f.id} disabled={busy} onClick={() => onPick(f)}>
              <ListItemIcon sx={{ minWidth: 36 }}>{fileIcon(f.mimetype)}</ListItemIcon>
              <ListItemText primary={f.name} secondary={fmtSize(f.size)} />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function FilesTab({ roomId, onToast }: { roomId: string; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const key = [...PANEL_KEY, 'files', roomId] as const;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const query = useQuery({
    queryKey: key,
    queryFn: () => roomCollabApi.listFiles(roomId),
  });

  const uploadM = useMutation({
    mutationFn: (file: File) => roomCollabApi.uploadFile(roomId, file),
    onSuccess: () => {
      onToast('File uploaded');
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => onToast(toMessage(e)),
  });

  const shareM = useMutation({
    mutationFn: (fileId: string) => roomCollabApi.shareFile(roomId, fileId),
    onSuccess: () => {
      onToast('File shared to room');
      setPickerOpen(false);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => onToast(toMessage(e)),
  });

  const deleteM = useMutation({
    mutationFn: (file: RoomFile) => roomCollabApi.deleteFile(roomId, file.id),
    onSuccess: () => {
      onToast('File removed');
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => onToast(toMessage(e)),
  });

  const files = query.data?.files ?? [];
  const note = query.isError ? accessNote(query.error) : null;

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1}>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadM.mutate(f);
            e.target.value = '';
          }}
        />
        <Button
          size="small"
          variant="outlined"
          startIcon={<CloudUploadIcon />}
          disabled={uploadM.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadM.isPending ? 'Uploading…' : 'Upload'}
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<UploadFileIcon />}
          onClick={() => setPickerOpen(true)}
        >
          Share from Vault
        </Button>
      </Stack>

      {query.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress size={22} />
        </Box>
      )}
      {note && <Alert severity="info">{note}</Alert>}
      {query.isError && !note && <Alert severity="error">{toMessage(query.error)}</Alert>}
      {query.isSuccess && files.length === 0 && (
        <Typography color="text.secondary" variant="body2">
          No files shared yet.
        </Typography>
      )}

      <List dense disablePadding>
        {files.map((f) => (
          <ListItem
            key={f.id}
            disableGutters
            secondaryAction={
              <Tooltip title="Remove">
                <IconButton
                  edge="end"
                  size="small"
                  color="error"
                  disabled={deleteM.isPending}
                  onClick={() => deleteM.mutate(f)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            }
          >
            <ListItemIcon sx={{ minWidth: 34 }}>{fileIcon(f.mimetype)}</ListItemIcon>
            <ListItemText
              primary={f.name}
              secondary={
                <>
                  {fmtSize(f.size)}
                  {f.size != null && ' · '}
                  <Chip
                    component="span"
                    size="small"
                    variant="outlined"
                    label={f.kind}
                    sx={{ height: 16, fontSize: 10 }}
                  />
                </>
              }
              secondaryTypographyProps={{ component: 'span' }}
            />
          </ListItem>
        ))}
      </List>

      {pickerOpen && (
        <VaultPicker
          busy={shareM.isPending}
          onClose={() => setPickerOpen(false)}
          onPick={(file) => shareM.mutate(file.id)}
        />
      )}
    </Stack>
  );
}

// ── People / Invites tab ─────────────────────────────────────────────────────

function PeopleTab({ roomId, onToast }: { roomId: string; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const key = [...PANEL_KEY, 'invites', roomId] as const;
  const [inviteeId, setInviteeId] = useState('');

  const query = useQuery({
    queryKey: key,
    queryFn: () => roomCollabApi.listInvites(roomId),
  });

  const inviteM = useMutation({
    mutationFn: (id: string) => roomCollabApi.createInvite(roomId, id),
    onSuccess: () => {
      onToast('Invite sent');
      setInviteeId('');
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => onToast(toMessage(e)),
  });

  const revokeM = useMutation({
    mutationFn: (inviteId: string) => roomCollabApi.revokeInvite(roomId, inviteId),
    onSuccess: () => {
      onToast('Invite revoked');
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => onToast(toMessage(e)),
  });

  const invites = query.data?.invites ?? [];
  const note = query.isError ? accessNote(query.error) : null;

  const submit = () => {
    const id = inviteeId.trim();
    if (id) inviteM.mutate(id);
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          fullWidth
          label="Invite by user id"
          value={inviteeId}
          onChange={(e) => setInviteeId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <Button
          variant="contained"
          startIcon={<PersonAddAlt1Icon />}
          disabled={!inviteeId.trim() || inviteM.isPending}
          onClick={submit}
        >
          Invite
        </Button>
      </Stack>

      <Divider />

      {query.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress size={22} />
        </Box>
      )}
      {note && <Alert severity="info">{note}</Alert>}
      {query.isError && !note && <Alert severity="error">{toMessage(query.error)}</Alert>}
      {query.isSuccess && invites.length === 0 && (
        <Typography color="text.secondary" variant="body2">
          No invites yet.
        </Typography>
      )}

      <List dense disablePadding>
        {invites.map((inv) => (
          <ListItem
            key={inv.id}
            disableGutters
            secondaryAction={
              inv.status === 'pending' ? (
                <Tooltip title="Revoke">
                  <IconButton
                    edge="end"
                    size="small"
                    color="error"
                    disabled={revokeM.isPending}
                    onClick={() => revokeM.mutate(inv.id)}
                  >
                    <HighlightOffIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : undefined
            }
          >
            <ListItemText
              primary={inv.inviteeId}
              secondary={
                <Chip
                  component="span"
                  size="small"
                  variant="outlined"
                  label={inv.status}
                  color={inv.status === 'accepted' ? 'success' : 'default'}
                  sx={{ height: 18, fontSize: 11 }}
                />
              }
              secondaryTypographyProps={{ component: 'span' }}
            />
          </ListItem>
        ))}
      </List>
    </Stack>
  );
}

// ── Requests tab ─────────────────────────────────────────────────────────────

function RequestsTab({
  roomId,
  isHost,
  onToast,
}: {
  roomId: string;
  isHost: boolean;
  onToast: (m: string) => void;
}) {
  const qc = useQueryClient();
  const key = [...PANEL_KEY, 'join-requests', roomId] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: () => roomCollabApi.listJoinRequests(roomId),
    enabled: isHost,
  });

  const requestM = useMutation({
    mutationFn: () => roomCollabApi.requestToJoin(roomId),
    onSuccess: () => onToast('Request to join sent'),
    onError: (e) => onToast(toMessage(e)),
  });

  const approveM = useMutation({
    mutationFn: (reqId: string) => roomCollabApi.approveJoinRequest(roomId, reqId),
    onSuccess: () => {
      onToast('Request approved');
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => onToast(toMessage(e)),
  });

  const denyM = useMutation({
    mutationFn: (reqId: string) => roomCollabApi.denyJoinRequest(roomId, reqId),
    onSuccess: () => {
      onToast('Request denied');
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => onToast(toMessage(e)),
  });

  if (!isHost) {
    return (
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary">
          This room requires host approval to join.
        </Typography>
        <Button
          variant="contained"
          disabled={requestM.isPending || requestM.isSuccess}
          onClick={() => requestM.mutate()}
        >
          {requestM.isSuccess ? 'Request sent' : 'Request to join'}
        </Button>
      </Stack>
    );
  }

  const requests = query.data?.requests ?? [];
  const note = query.isError ? accessNote(query.error) : null;

  return (
    <Stack spacing={1.5}>
      {query.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress size={22} />
        </Box>
      )}
      {note && <Alert severity="info">{note}</Alert>}
      {query.isError && !note && <Alert severity="error">{toMessage(query.error)}</Alert>}
      {query.isSuccess && requests.length === 0 && (
        <Typography color="text.secondary" variant="body2">
          No pending requests.
        </Typography>
      )}

      <List dense disablePadding>
        {requests.map((req) => (
          <ListItem
            key={req.id}
            disableGutters
            secondaryAction={
              req.status === 'pending' ? (
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Approve">
                    <IconButton
                      size="small"
                      color="success"
                      disabled={approveM.isPending}
                      onClick={() => approveM.mutate(req.id)}
                    >
                      <CheckCircleOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Deny">
                    <IconButton
                      size="small"
                      color="error"
                      disabled={denyM.isPending}
                      onClick={() => denyM.mutate(req.id)}
                    >
                      <HighlightOffIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              ) : (
                <Chip size="small" variant="outlined" label={req.status} />
              )
            }
          >
            <ListItemText primary={req.userId} secondary={req.status} />
          </ListItem>
        ))}
      </List>
    </Stack>
  );
}

// ── Recording tab ────────────────────────────────────────────────────────────

function RecordingTab({
  roomId,
  isHost,
  onToast,
}: {
  roomId: string;
  isHost: boolean;
  onToast: (m: string) => void;
}) {
  const qc = useQueryClient();
  const key = [...PANEL_KEY, 'recordings', roomId] as const;
  const [quality, setQuality] = useState<RecordingQuality>('source');

  const query = useQuery({
    queryKey: key,
    queryFn: () => roomCollabApi.listRecordings(roomId),
  });

  const startM = useMutation({
    mutationFn: () => roomCollabApi.startRecording(roomId, quality),
    onSuccess: () => {
      onToast('Recording started');
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => onToast(toMessage(e)),
  });

  const stopM = useMutation({
    mutationFn: () => roomCollabApi.stopRecording(roomId),
    onSuccess: () => {
      onToast('Recording stopped');
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => onToast(toMessage(e)),
  });

  const recordings = query.data?.recordings ?? [];
  const note = query.isError ? accessNote(query.error) : null;

  return (
    <Stack spacing={1.5}>
      {isHost ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            select
            size="small"
            label="Quality"
            value={quality}
            onChange={(e) => setQuality(e.target.value as RecordingQuality)}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="source">Source</MenuItem>
            <MenuItem value="1080p">1080p</MenuItem>
            <MenuItem value="720p">720p</MenuItem>
          </TextField>
          <Button
            variant="contained"
            color="error"
            startIcon={<FiberManualRecordIcon />}
            disabled={startM.isPending}
            onClick={() => startM.mutate()}
          >
            Start
          </Button>
          <Button
            variant="outlined"
            startIcon={<StopCircleIcon />}
            disabled={stopM.isPending}
            onClick={() => stopM.mutate()}
          >
            Stop
          </Button>
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Only the host can control recording.
        </Typography>
      )}

      <Divider />

      <Typography variant="subtitle2">Recordings</Typography>
      {query.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress size={22} />
        </Box>
      )}
      {note && <Alert severity="info">{note}</Alert>}
      {query.isError && !note && <Alert severity="error">{toMessage(query.error)}</Alert>}
      {query.isSuccess && recordings.length === 0 && (
        <Typography color="text.secondary" variant="body2">
          No recordings yet.
        </Typography>
      )}

      <List dense disablePadding>
        {recordings.map((r) => (
          <ListItem key={r.id} disableGutters>
            <ListItemIcon sx={{ minWidth: 34 }}>
              <VideoFileIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={r.title || r.id}
              secondary={
                <Chip
                  component="span"
                  size="small"
                  variant="outlined"
                  label={r.status || 'processing'}
                  color={r.status === 'ready' ? 'success' : 'default'}
                  sx={{ height: 18, fontSize: 11 }}
                />
              }
              secondaryTypographyProps={{ component: 'span' }}
            />
          </ListItem>
        ))}
      </List>
    </Stack>
  );
}

// ── Panel shell ──────────────────────────────────────────────────────────────

type PanelTab = 'files' | 'people' | 'requests' | 'recording';

export function RoomPanel({ room, currentUserId }: { room: Room; currentUserId?: string }) {
  const isHost = !!currentUserId && room.host_id === currentUserId;
  const isRequestPolicy = room.join_policy === 'request';
  // Requests tab shows for the host (to approve) or, on a request-policy room,
  // for a non-host who wants to ask to join.
  const showRequests = isHost || isRequestPolicy;

  const [tab, setTab] = useState<PanelTab>('files');
  const [toast, setToast] = useState<string | null>(null);

  // Keep the selected tab valid if gating hides it.
  const effectiveTab = useMemo<PanelTab>(() => {
    if (tab === 'requests' && !showRequests) return 'files';
    return tab;
  }, [tab, showRequests]);

  return (
    <Paper
      variant="outlined"
      sx={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <Tabs
        value={effectiveTab}
        onChange={(_e, v: PanelTab) => setTab(v)}
        variant="fullWidth"
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40 }}
      >
        <Tab value="files" label="Files" sx={{ minHeight: 40 }} />
        <Tab value="people" label="People" sx={{ minHeight: 40 }} />
        {showRequests && <Tab value="requests" label="Requests" sx={{ minHeight: 40 }} />}
        <Tab value="recording" label="Recording" sx={{ minHeight: 40 }} />
      </Tabs>

      <Box sx={{ p: 1.5, overflowY: 'auto', flexGrow: 1 }}>
        {effectiveTab === 'files' && <FilesTab roomId={room.id} onToast={setToast} />}
        {effectiveTab === 'people' && <PeopleTab roomId={room.id} onToast={setToast} />}
        {effectiveTab === 'requests' && showRequests && (
          <RequestsTab roomId={room.id} isHost={isHost} onToast={setToast} />
        )}
        {effectiveTab === 'recording' && (
          <RecordingTab roomId={room.id} isHost={isHost} onToast={setToast} />
        )}
      </Box>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Paper>
  );
}
