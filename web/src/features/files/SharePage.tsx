import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { isHttpError, toMessage } from '@/lib/errors';
import { filevaultApi } from '@/api/filevault';
import { formatBytes } from './util';

/**
 * Public share landing (route `/s/:shareLinkId`, outside the auth shell). Fetches
 * link metadata anonymously and offers a Download button that hits the public
 * `/filevault/api/share/:id/download` route (no bearer required).
 *
 * NOTE: the backend has no password-protected links (the create/download
 * handlers accept no password), so no password prompt is shown.
 */
export function SharePage() {
  const { shareLinkId } = useParams<{ shareLinkId: string }>();

  const query = useQuery({
    queryKey: ['filevault', 'shared', shareLinkId],
    queryFn: () => filevaultApi.getSharedFile(shareLinkId as string),
    enabled: !!shareLinkId,
    // The backend increments the link's use-count on every metadata access, so
    // never auto-refetch — one fetch per visit.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const file = query.data?.file;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        bgcolor: 'background.default',
      }}
    >
      <Paper
        variant="outlined"
        sx={{ p: 4, width: '100%', maxWidth: 440, textAlign: 'center' }}
      >
        <Stack spacing={2} alignItems="center">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1,
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                fontWeight: 700,
              }}
            >
              E
            </Box>
            <Typography variant="h6">Exprsn</Typography>
          </Box>

          {query.isLoading && <CircularProgress />}

          {query.isError &&
            (isHttpError(query.error, 404) || isHttpError(query.error, 400) ? (
              <Stack spacing={1} alignItems="center">
                <LinkOffIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                <Typography color="text.secondary">
                  This share link is invalid, expired, or has been revoked.
                </Typography>
              </Stack>
            ) : (
              <Alert severity="error" sx={{ width: '100%' }}>
                {toMessage(query.error)}
              </Alert>
            ))}

          {query.isSuccess && file && (
            <>
              <InsertDriveFileOutlinedIcon sx={{ fontSize: 56, color: 'primary.main' }} />
              <Typography variant="subtitle1" sx={{ wordBreak: 'break-all' }}>
                {file.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {file.mimetype ?? 'file'} · {formatBytes(file.size)}
              </Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<DownloadIcon />}
                component="a"
                href={filevaultApi.shareDownloadUrl(shareLinkId as string)}
              >
                Download
              </Button>
              <Typography variant="caption" color="text.secondary">
                Shared securely via Exprsn FileVault.
              </Typography>
            </>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
