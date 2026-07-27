import { useEffect, useState } from 'react';
import { Box, Chip, CircularProgress, Dialog, IconButton, Stack, Typography } from '@mui/material';
import BrokenImageOutlinedIcon from '@mui/icons-material/BrokenImageOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import SensorsIcon from '@mui/icons-material/Sensors';
import { filevaultApi } from '@/api/filevault';
import type { PostMedia } from '@/api/timeline';
import { HlsPlayer } from '@/features/streams/HlsPlayer';

/** True for items that play as HLS in a dedicated live/VOD card. */
function isLive(m: PostMedia): boolean {
  return m.type === 'live';
}
/** True for items that play inline as a `<video>` (mp4 etc.). */
function isVideo(m: PostMedia): boolean {
  return m.type === 'video';
}

/**
 * Loads a displayable URL for a media item and (for FileVault blobs) revokes it
 * on unmount / dependency change. Direct `url` items resolve immediately —
 * revoking a non-blob URL is a harmless no-op, so the same cleanup path is safe
 * for both modes.
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

/** Resolve a grid-thumbnail URL: explicit poster → direct url → FileVault thumb. */
function thumbLoader(item: PostMedia): Promise<string> {
  if (item.thumbnailUrl) return Promise.resolve(item.thumbnailUrl);
  if (item.type === 'image' || !item.type) {
    if (item.url) return Promise.resolve(item.url);
    if (item.id) return filevaultApi.getThumbnail(item.id, 'small');
  }
  // Best-effort poster for a video/live item backed by a FileVault asset.
  if (item.id) return filevaultApi.getThumbnail(item.id, 'small');
  return Promise.reject(new Error('no thumbnail'));
}

/** Resolve the full-resolution image URL for the lightbox. */
function fullImageLoader(item: PostMedia): Promise<string> {
  if (item.url) return Promise.resolve(item.url);
  if (item.id) return filevaultApi.getThumbnail(item.id, 'large');
  return Promise.reject(new Error('no image'));
}

/** Small badge overlaid on playable (video/live) thumbnails. */
function PlayBadge({ live }: { live?: boolean }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          bgcolor: 'color-mix(in srgb, var(--exprsn-black) 55%, transparent)',
          color: 'common.white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PlayArrowIcon />
      </Box>
      {live && (
        <Chip
          size="small"
          color="error"
          label="● LIVE"
          sx={{ position: 'absolute', top: 8, left: 8, fontWeight: 700 }}
        />
      )}
    </Box>
  );
}

/** A single thumbnail tile (image / video poster / live poster). */
function Thumb({ item, onOpen }: { item: PostMedia; onOpen: () => void }) {
  const { url, failed } = useObjectUrl(() => thumbLoader(item), [item.id, item.url, item.thumbnailUrl]);
  const playable = isVideo(item) || isLive(item);

  return (
    <Box
      onClick={onOpen}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        cursor: 'pointer',
        bgcolor: playable ? 'common.black' : 'action.hover',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {url ? (
        <Box
          component="img"
          src={url}
          alt={item.altText ?? item.title ?? ''}
          loading="lazy"
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: playable ? 0.85 : 1 }}
        />
      ) : failed ? (
        // No poster: fall back to a type icon on a dark tile (common for video/live).
        playable ? (
          <VideocamOutlinedIcon sx={{ color: 'grey.500', fontSize: 40 }} />
        ) : (
          <BrokenImageOutlinedIcon color="disabled" />
        )
      ) : (
        <CircularProgress size={18} />
      )}
      {playable && (url || failed) && <PlayBadge live={isLive(item)} />}
    </Box>
  );
}

/** A full-width live/VOD card: poster + LIVE badge, expands to an HLS player. */
function LiveCard({ item }: { item: PostMedia }) {
  const [open, setOpen] = useState(false);
  const src = item.url ?? null;

  return (
    <Box sx={{ mt: 1 }}>
      {open && src ? (
        <Box>
          <HlsPlayer src={src} />
          {item.title && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {item.title}
            </Typography>
          )}
        </Box>
      ) : (
        <Box
          onClick={() => src && setOpen(true)}
          sx={{
            position: 'relative',
            aspectRatio: '16 / 9',
            borderRadius: 1,
            overflow: 'hidden',
            cursor: src ? 'pointer' : 'default',
            bgcolor: 'common.black',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LivePoster item={item} />
          <PlayBadge live />
          {item.title && (
            <Typography
              variant="body2"
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                p: 1,
                color: 'common.white',
                background: 'linear-gradient(transparent, color-mix(in srgb, var(--exprsn-black) 70%, transparent))',
              }}
              noWrap
            >
              {item.title}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

/** Poster image for a LiveCard (or a fallback gradient with a sensors icon). */
function LivePoster({ item }: { item: PostMedia }) {
  const { url } = useObjectUrl(() => thumbLoader(item), [item.id, item.url, item.thumbnailUrl]);
  if (url) {
    return (
      <Box
        component="img"
        src={url}
        alt={item.altText ?? item.title ?? ''}
        sx={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
      />
    );
  }
  return <SensorsIcon sx={{ color: 'grey.600', fontSize: 56 }} />;
}

/** Lightbox content for an image or an inline `<video>` (mp4). */
function MediaFrame({ item }: { item: PostMedia }) {
  const image = useObjectUrl(() => fullImageLoader(item), [item.id, item.url]);

  if (isVideo(item)) {
    if (!item.url) return <BrokenImageOutlinedIcon sx={{ color: 'common.white', fontSize: 48 }} />;
    return (
      <Box
        component="video"
        src={item.url}
        poster={item.thumbnailUrl}
        controls
        autoPlay
        playsInline
        sx={{ maxWidth: '100%', maxHeight: '80vh', display: 'block', bgcolor: 'black' }}
      />
    );
  }

  if (image.failed) return <BrokenImageOutlinedIcon sx={{ color: 'common.white', fontSize: 48 }} />;
  if (!image.url) return <CircularProgress sx={{ color: 'common.white' }} />;
  return (
    <Box
      component="img"
      src={image.url}
      alt={item.altText ?? item.title ?? ''}
      sx={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block' }}
    />
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
          <MediaFrame item={item} />
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
                  bgcolor: i === index ? 'common.white' : 'color-mix(in srgb, var(--exprsn-white) 40%, transparent)',
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
 * A post's media attachments. Live (HLS) items render as full-width player
 * cards; images and videos share a responsive 1–4 tile grid with a lightbox
 * (images open large, videos play inline). When more than four image/video
 * tiles are present the fourth shows a "+N" overflow badge but all are
 * navigable in the lightbox. URLs are bearer-authed FileVault blobs or direct
 * links (see useObjectUrl / the PostMedia type).
 */
export function PostMediaGrid({ media }: { media: PostMedia[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const all = media.filter((m) => m && (m.id || m.url));
  const live = all.filter(isLive);
  const tiles = all.filter((m) => !isLive(m));

  if (all.length === 0) return null;

  const visible = tiles.slice(0, 4);
  const overflow = tiles.length - visible.length;
  const cols = visible.length === 1 ? 1 : 2;

  return (
    <>
      {live.map((item, i) => (
        <LiveCard key={`live-${item.id ?? item.url ?? i}`} item={item} />
      ))}

      {visible.length > 0 && (
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
          {visible.map((item, i) => {
            const last = i === visible.length - 1;
            return (
              <Box
                key={item.id ?? item.url ?? i}
                sx={{
                  position: 'relative',
                  aspectRatio: visible.length === 1 ? '16 / 10' : '1 / 1',
                  // A lone 3rd image spans the full width for a balanced layout.
                  gridColumn: visible.length === 3 && i === 2 ? '1 / -1' : undefined,
                }}
              >
                <Thumb item={item} onOpen={() => setOpen(i)} />
                {overflow > 0 && last && (
                  <Box
                    onClick={() => setOpen(i)}
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      bgcolor: 'color-mix(in srgb, var(--exprsn-black) 55%, transparent)',
                      color: 'common.white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: 24,
                      fontWeight: 600,
                    }}
                  >
                    +{overflow + 1}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {open != null && (
        <Lightbox items={tiles} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
