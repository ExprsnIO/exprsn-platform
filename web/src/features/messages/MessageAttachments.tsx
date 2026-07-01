import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import VideocamIcon from '@mui/icons-material/Videocam';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import { filevaultApi } from '@/api/filevault';
import type { ChatAttachment } from '@/api/spark';

/** Human-readable size. */
function fmtBytes(n?: number): string {
  if (!n || n <= 0) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

/** Bearer-authed FileVault object URL, revoked on unmount. */
function useObjectUrl(loader: () => Promise<string>, deps: unknown[]) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let created: string | null = null;
    setUrl(null);
    setFailed(false);
    loader()
      .then((u) => {
        if (!active) return URL.revokeObjectURL(u);
        created = u;
        setUrl(u);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { url, failed };
}

function ImageAttachment({ a, mine }: { a: ChatAttachment; mine: boolean }) {
  const { url } = useObjectUrl(() => filevaultApi.getThumbnail(a.fileId!, 'medium'), [a.fileId]);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Box
        onClick={() => setOpen(true)}
        sx={{
          width: 200,
          height: 150,
          borderRadius: 1.5,
          overflow: 'hidden',
          cursor: 'pointer',
          bgcolor: mine ? 'rgba(255,255,255,0.15)' : 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {url ? (
          <Box component="img" src={url} alt={a.name ?? ''} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <CircularProgress size={18} />
        )}
      </Box>
      {open && <ImageLightbox a={a} onClose={() => setOpen(false)} />}
    </>
  );
}

function ImageLightbox({ a, onClose }: { a: ChatAttachment; onClose: () => void }) {
  const { url } = useObjectUrl(() => filevaultApi.getFileObjectUrl(a.fileId!), [a.fileId]);
  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <Box sx={{ position: 'relative', bgcolor: 'black' }}>
        <IconButton size="small" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8, color: 'common.white', zIndex: 1 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
        <Box sx={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
          {url ? (
            <Box component="img" src={url} alt={a.name ?? ''} sx={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }} />
          ) : (
            <CircularProgress sx={{ color: 'common.white' }} />
          )}
        </Box>
      </Box>
    </Dialog>
  );
}

function VideoAttachment({ a }: { a: ChatAttachment }) {
  const { url, failed } = useObjectUrl(() => filevaultApi.getFileObjectUrl(a.fileId!), [a.fileId]);
  if (failed) return <FileAttachment a={a} mine={false} />;
  if (!url) {
    return (
      <Box sx={{ width: 260, height: 150, borderRadius: 1.5, bgcolor: 'common.black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={18} sx={{ color: 'common.white' }} />
      </Box>
    );
  }
  return (
    <Box component="video" src={url} poster={a.thumbnailUrl} controls sx={{ width: 260, maxWidth: '100%', borderRadius: 1.5, display: 'block', bgcolor: 'black' }} />
  );
}

function FileAttachment({ a, mine }: { a: ChatAttachment; mine: boolean }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (!a.fileId) return;
    setBusy(true);
    try {
      await filevaultApi.download({ id: a.fileId, name: a.name ?? 'file' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      sx={{
        px: 1.25,
        py: 1,
        borderRadius: 1.5,
        bgcolor: mine ? 'rgba(255,255,255,0.15)' : 'action.hover',
        minWidth: 200,
        maxWidth: 280,
      }}
    >
      <InsertDriveFileOutlinedIcon />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap>{a.name ?? 'File'}</Typography>
        {a.size ? (
          <Typography variant="caption" sx={{ opacity: 0.7 }}>{fmtBytes(a.size)}</Typography>
        ) : null}
      </Box>
      <IconButton size="small" onClick={download} disabled={busy} sx={{ color: 'inherit' }}>
        <DownloadIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

function CallCard({ a }: { a: ChatAttachment }) {
  const navigate = useNavigate();
  return (
    <Stack spacing={1} sx={{ px: 1.5, py: 1.25, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', minWidth: 220, bgcolor: 'background.paper', color: 'text.primary' }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <VideocamIcon color="primary" />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.title || 'Video call'}</Typography>
      </Stack>
      <Button size="small" variant="contained" onClick={() => navigate(`/rooms?join=${encodeURIComponent(a.roomCode ?? '')}`)} disabled={!a.roomCode}>
        Join call
      </Button>
    </Stack>
  );
}

function LinkCard({ a }: { a: ChatAttachment }) {
  const navigate = useNavigate();
  const internal = a.url?.startsWith('/');
  const open = () => {
    if (!a.url) return;
    if (internal) navigate(a.url);
    else window.open(a.url, '_blank', 'noopener');
  };
  return (
    <Stack spacing={0.5} onClick={open} sx={{ px: 1.5, py: 1.25, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', minWidth: 220, maxWidth: 300, bgcolor: 'background.paper', color: 'text.primary', cursor: 'pointer' }}>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <OpenInNewIcon fontSize="small" color="action" />
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{a.title || a.url}</Typography>
      </Stack>
      {a.subtitle && (
        <Typography variant="caption" color="text.secondary" noWrap>{a.subtitle}</Typography>
      )}
    </Stack>
  );
}

/** Render a message's attachments below its text. */
export function MessageAttachments({ attachments, mine }: { attachments: ChatAttachment[]; mine: boolean }) {
  if (!attachments?.length) return null;
  return (
    <Stack spacing={1} sx={{ mt: 0.75 }}>
      {attachments.map((a, i) => {
        if (a.kind === 'image' && a.fileId) return <ImageAttachment key={i} a={a} mine={mine} />;
        if (a.kind === 'video' && a.fileId) return <VideoAttachment key={i} a={a} />;
        if (a.kind === 'call') return <CallCard key={i} a={a} />;
        if (a.kind === 'link') return <LinkCard key={i} a={a} />;
        return <FileAttachment key={i} a={a} mine={mine} />;
      })}
    </Stack>
  );
}
