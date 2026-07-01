/**
 * Inline media player for FileVault audio/video. The bytes have no public URL —
 * they're served only to a bearer-authed request — so we load them through
 * `useObjectUrl` (fetch → blob → object URL, revoked on unmount) and feed the
 * resulting URL into a native <video>/<audio> element.
 */
import { Alert, Box, CircularProgress } from '@mui/material';
import { filevaultApi, type FileItem } from '@/api/filevault';
import { isVideoType, useObjectUrl } from '../util';

export function MediaPlayer({ file }: { file: FileItem }) {
  const isVideo = isVideoType(file.mimetype);
  const { url, failed } = useObjectUrl(() => filevaultApi.getFileObjectUrl(file.id), [file.id]);

  if (failed) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Couldn’t load this media.
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

  if (isVideo) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', bgcolor: 'black' }}>
        <Box
          component="video"
          src={url}
          controls
          sx={{ maxWidth: '100%', maxHeight: '70vh', display: 'block' }}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
      <Box component="audio" src={url} controls sx={{ width: '100%', maxWidth: 480 }} />
    </Box>
  );
}
