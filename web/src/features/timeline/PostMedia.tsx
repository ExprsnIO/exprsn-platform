import { useEffect, useState } from 'react';
import { Box, CircularProgress, Dialog, IconButton, Stack } from '@mui/material';
import BrokenImageOutlinedIcon from '@mui/icons-material/BrokenImageOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { filevaultApi } from '@/api/filevault';
import type { PostMedia } from '@/api/timeline';

/**
 * Loads a bearer-authed object URL (thumbnail or full image) and revokes it on
 * unmount / dependency change. Post media has no public URL — the thumbnail
 * route serves bytes only to an authenticated request whose file is the owner's
 * or has visibility shared/public, so they must be fetched as blobs and wrapped.
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

function Thumb({
  item,
  onOpen,
}: {
  item: PostMedia;
  onOpen: () => void;
}) {
  const { url, failed } = useObjectUrl(() => filevaultApi.getThumbnail(item.id, 'small'), [item.id]);

  return (
    <Box
      onClick={onOpen}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        cursor: 'pointer',
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
          alt=""
          loading="lazy"
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <CircularProgress size={18} />
      )}
    </Box>
  );
}

function Lightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: PostMedia[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const item = items[index];
  const { url, failed } = useObjectUrl(() => filevaultApi.getThumbnail(item.id, 'large'), [item.id]);
  const multi = items.length > 1;
  const prev = () => onIndex((index - 1 + items.length) % items.length);
  const next = () => onIndex((index + 1) % items.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length]);

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <Box sx={{ position: 'relative', bgcolor: 'black' }}>
        <IconButton
          size="small"
          onClick={onClose}
          sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, color: 'common.white' }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
        {multi && (
          <>
            <IconButton
              onClick={prev}
              sx={{ position: 'absolute', top: '50%', left: 8, transform: 'translateY(-50%)', zIndex: 1, color: 'common.white' }}
            >
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              onClick={next}
              sx={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', zIndex: 1, color: 'common.white' }}
            >
              <ChevronRightIcon />
            </IconButton>
          </>
        )}
        <Box sx={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
          {failed ? (
            <BrokenImageOutlinedIcon sx={{ color: 'common.white', fontSize: 48 }} />
          ) : url ? (
            <Box
              component="img"
              src={url}
              alt=""
              sx={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block' }}
            />
          ) : (
            <CircularProgress sx={{ color: 'common.white' }} />
          )}
        </Box>
        {multi && (
          <Stack
            direction="row"
            spacing={0.5}
            justifyContent="center"
            sx={{ position: 'absolute', bottom: 8, left: 0, right: 0 }}
          >
            {items.map((_, i) => (
              <Box
                key={i}
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: i === index ? 'common.white' : 'rgba(255,255,255,0.4)',
                }}
              />
            ))}
          </Stack>
        )}
      </Box>
    </Dialog>
  );
}

/**
 * Responsive 1–4 image grid for a post's media attachments, with a lightbox
 * (prev/next/close) on click. Object URLs are bearer-authed and revoked on
 * unmount (see useObjectUrl).
 */
export function PostMediaGrid({ media }: { media: PostMedia[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const items = media.filter((m) => m?.id);
  if (items.length === 0) return null;

  const cols = items.length === 1 ? 1 : 2;

  return (
    <>
      <Box
        sx={{
          mt: 1,
          display: 'grid',
          gap: 0.5,
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        {items.map((item, i) => (
          <Box
            key={item.id}
            sx={{
              aspectRatio: items.length === 1 ? '16 / 10' : '1 / 1',
              // A lone 3rd image spans the full width for a balanced layout.
              gridColumn: items.length === 3 && i === 2 ? '1 / -1' : undefined,
            }}
          >
            <Thumb item={item} onOpen={() => setOpen(i)} />
          </Box>
        ))}
      </Box>
      {open != null && (
        <Lightbox items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
