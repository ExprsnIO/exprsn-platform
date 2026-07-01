import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import HistoryIcon from '@mui/icons-material/History';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import { filevaultApi, type FileItem } from '@/api/filevault';
import {
  formatBytes,
  formatDate,
  isAudioType,
  isCsvType,
  isImageType,
  isJsonType,
  isMarkdown,
  isOfficeType,
  isPdfType,
  isVideoType,
  useObjectUrl,
} from './util';
import { MarkdownView } from './MarkdownView';
import { CsvTable } from './viewers/CsvTable';
import { JsonView } from './viewers/JsonView';
import { MediaPlayer } from './viewers/MediaPlayer';
import { OfficeView } from './viewers/OfficeView';

/** Image + PDF render via a bearer-authed object URL (the original behavior). */
function ImagePdfView({ file }: { file: FileItem }) {
  const { url, failed } = useObjectUrl(() => filevaultApi.getFileObjectUrl(file.id), [file.id]);

  if (failed) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Couldn’t load this file.
      </Alert>
    );
  }

  if (!url) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isPdfType(file.mimetype)) {
    return (
      <Box
        component="iframe"
        src={url}
        title={file.name}
        sx={{ width: '100%', height: '70vh', border: 0 }}
      />
    );
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', bgcolor: 'black' }}>
      <Box
        component="img"
        src={url}
        alt={file.name}
        sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }}
      />
    </Box>
  );
}

/** Read-only Markdown render: fetch decoded text → GFM render. */
function MarkdownFile({ file }: { file: FileItem }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setText(null);
    setFailed(false);
    filevaultApi
      .getTextContent(file.id)
      .then((t) => {
        if (active) setText(t);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [file.id]);

  if (failed) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Couldn’t load this file.
      </Alert>
    );
  }
  if (text === null) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
        <CircularProgress />
      </Box>
    );
  }
  return (
    <Box sx={{ p: 2, maxHeight: '70vh', overflow: 'auto' }}>
      <MarkdownView source={text} />
    </Box>
  );
}

/**
 * Dispatch a file to the right read-only viewer by type. Order matters: image
 * and PDF keep their original object-URL render; media streams an object URL;
 * the text/office viewers fetch text or an ArrayBuffer themselves.
 */
function PreviewBody({ file, onDownload }: { file: FileItem; onDownload: (file: FileItem) => void }) {
  const { mimetype, name } = file;

  if (isImageType(mimetype) || isPdfType(mimetype)) return <ImagePdfView file={file} />;
  if (isVideoType(mimetype) || isAudioType(mimetype)) return <MediaPlayer file={file} />;
  if (isMarkdown(mimetype, name)) return <MarkdownFile file={file} />;
  if (isCsvType(mimetype, name)) return <CsvTable file={file} />;
  if (isJsonType(mimetype, name)) return <JsonView file={file} />;
  if (isOfficeType(mimetype, name)) return <OfficeView file={file} />;

  return (
    <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
      <InsertDriveFileOutlinedIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
      <Typography sx={{ mt: 1 }}>No preview available for this file type.</Typography>
      <Button sx={{ mt: 2 }} startIcon={<DownloadIcon />} onClick={() => onDownload(file)}>
        Download
      </Button>
    </Box>
  );
}

/**
 * Preview a single file: image/PDF render via a bearer-authed object URL (revoked
 * on unmount), other types show metadata only. Download/Share/Version-history are
 * delegated to the caller so the explorer owns those flows.
 */
export function FilePreview({
  file,
  open,
  onClose,
  onDownload,
  onShare,
  onVersions,
}: {
  file: FileItem;
  open: boolean;
  onClose: () => void;
  onDownload: (file: FileItem) => void;
  onShare: (file: FileItem) => void;
  onVersions: (file: FileItem) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ wordBreak: 'break-all' }}>{file.name}</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <PreviewBody file={file} onDownload={onDownload} />
        <Divider />
        <Stack spacing={0.5} sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {file.mimetype ?? 'unknown type'} · {formatBytes(file.size)}
            {file.currentVersion ? ` · v${file.currentVersion}` : ''}
          </Typography>
          {file.path && (
            <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              {file.path}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Modified {formatDate(file.updatedAt || file.createdAt)}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button startIcon={<HistoryIcon />} onClick={() => onVersions(file)}>
          Versions
        </Button>
        <Button startIcon={<ShareOutlinedIcon />} onClick={() => onShare(file)}>
          Share
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => onDownload(file)}>
          Download
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
