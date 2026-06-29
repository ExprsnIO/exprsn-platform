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
import BrokenImageOutlinedIcon from '@mui/icons-material/BrokenImageOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import HistoryIcon from '@mui/icons-material/History';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import { filevaultApi, type FileItem } from '@/api/filevault';
import { formatBytes, formatDate, isImageType, isPdfType, useObjectUrl } from './util';

function PreviewBody({ file }: { file: FileItem }) {
  const previewable = isImageType(file.mimetype) || isPdfType(file.mimetype);
  const { url, failed } = useObjectUrl(
    () => filevaultApi.getFileObjectUrl(file.id),
    [file.id],
  );

  if (!previewable) {
    return (
      <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
        <InsertDriveFileOutlinedIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
        <Typography sx={{ mt: 1 }}>No preview available for this file type.</Typography>
      </Box>
    );
  }

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
        {failed ? <BrokenImageOutlinedIcon color="disabled" /> : <CircularProgress />}
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
        <PreviewBody file={file} />
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
