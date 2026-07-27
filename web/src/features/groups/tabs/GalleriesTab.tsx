import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  IconButton,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import BrokenImageOutlinedIcon from '@mui/icons-material/BrokenImageOutlined';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import { isHttpError, toMessage } from '@/lib/errors';
import { filevaultApi, type FileItem } from '@/api/filevault';
import { formatBytes } from '@/features/files/util';
import type { GroupTabProps } from './types';

/**
 * Loads a bearer-authed object URL (thumbnail or full image) and revokes it on
 * unmount / id change. Thumbnails and full images have no public URL — they are
 * served only to authenticated, group-member-guarded requests, so they must be
 * fetched as blobs and wrapped.
 */
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
        if (!active) {
          URL.revokeObjectURL(u);
          return;
        }
        created = u;
        setUrl(u);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
    // loader is recreated each render; deps are the real dependency signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { url, failed };
}

function GalleryThumb({ file, onOpen }: { file: FileItem; onOpen: (file: FileItem) => void }) {
  const { url, failed } = useObjectUrl(() => filevaultApi.getThumbnail(file.id, 'medium'), [file.id]);

  return (
    <Box
      component="button"
      type="button"
      onClick={() => onOpen(file)}
      aria-label={`Open ${file.name}`}
      sx={{
        position: 'relative',
        aspectRatio: '1 / 1',
        borderRadius: 1,
        overflow: 'hidden',
        cursor: 'pointer',
        border: '1px solid',
        p: 0,
        textAlign: 'left',
        borderColor: 'divider',
        bgcolor: 'action.hover',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {failed ? (
        <BrokenImageOutlinedIcon color="disabled" />
      ) : url ? (
        <Box
          component="img"
          src={url}
          alt={file.name}
          loading="lazy"
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <CircularProgress size={20} />
      )}
    </Box>
  );
}

function Lightbox({
  file,
  onClose,
  onDownload,
}: {
  file: FileItem;
  onClose: () => void;
  onDownload: (file: FileItem) => void;
}) {
  const { url, failed } = useObjectUrl(() => filevaultApi.getFileObjectUrl(file.id), [file.id]);

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <Box sx={{ position: 'relative', bgcolor: 'black' }}>
        <Stack
          direction="row"
          spacing={0.5}
          sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
        >
          <IconButton size="small" aria-label="Download" onClick={() => onDownload(file)} sx={{ color: 'common.white' }}>
            <DownloadIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" aria-label="Close" onClick={onClose} sx={{ color: 'common.white' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Box
          sx={{
            minHeight: 240,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 2,
          }}
        >
          {failed ? (
            <Alert severity="error" sx={{ m: 2 }}>
              Couldn’t load this image.
            </Alert>
          ) : url ? (
            <Box
              component="img"
              src={url}
              alt={file.name}
              sx={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block' }}
            />
          ) : (
            <CircularProgress sx={{ color: 'common.white' }} />
          )}
        </Box>
      </Box>
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="body2" noWrap title={file.name}>
          {file.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatBytes(file.size)}
        </Typography>
      </Box>
    </Dialog>
  );
}

/**
 * Galleries tab — a thumbnail grid of the group's image files with a lightbox
 * preview. Upload is member+write gated (uploadMedia); viewing is members-only
 * (viewMemberContent). Thumbnails and full images are fetched as bearer-authed
 * blobs (there is no public URL).
 */
export default function GalleriesTab({ groupId, ctx }: GroupTabProps) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [active, setActive] = useState<FileItem | null>(null);

  const canView = ctx.can('viewMemberContent');
  const canUpload = ctx.can('uploadMedia');

  const galleryKey = ['filevault', 'group-images', groupId] as const;

  const query = useQuery({
    queryKey: galleryKey,
    queryFn: () => filevaultApi.listGroupFiles(groupId, { images: true, limit: 100 }),
    enabled: canView,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => filevaultApi.uploadToGroup(groupId, file),
    onSuccess: (res) => {
      setToast(`Uploaded “${res.file?.name ?? 'image'}”`);
      qc.invalidateQueries({ queryKey: galleryKey });
    },
    onError: (err) => setToast(toMessage(err)),
  });

  const downloadMutation = useMutation({
    mutationFn: (item: FileItem) => filevaultApi.download(item),
    onError: (err) => setToast(toMessage(err)),
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = '';
  };

  if (!canView) {
    return (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        Galleries are visible to group members only. Join the group to see them.
      </Typography>
    );
  }

  const images = query.data?.files ?? [];

  return (
    <Stack spacing={2}>
      {canUpload && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            {images.length} image{images.length === 1 ? '' : 's'}
          </Typography>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={onPick} />
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddPhotoAlternateOutlinedIcon />}
            disabled={uploadMutation.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {uploadMutation.isPending ? 'Uploading…' : 'Upload image'}
          </Button>
        </Stack>
      )}

      {uploadMutation.isPending && <LinearProgress />}

      {query.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress size={26} />
        </Box>
      )}

      {query.isError &&
        (isHttpError(query.error, 403) ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
            Galleries are visible to group members only.
          </Typography>
        ) : (
          <Alert severity="error">{toMessage(query.error)}</Alert>
        ))}

      {query.isSuccess &&
        (images.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
            <CollectionsOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled' }} />
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              No images yet.{canUpload ? ' Upload the first one.' : ''}
            </Typography>
          </Paper>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gap: 1,
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            }}
          >
            {images.map((img) => (
              <GalleryThumb key={img.id} file={img} onOpen={setActive} />
            ))}
          </Box>
        ))}

      {active && (
        <Lightbox
          file={active}
          onClose={() => setActive(null)}
          onDownload={(f) => downloadMutation.mutate(f)}
        />
      )}

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
