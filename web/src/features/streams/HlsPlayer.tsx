import { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import Hls from 'hls.js';

/**
 * HLS video player. Uses native HLS where supported (Safari), otherwise hls.js.
 * Tolerates a not-yet-live manifest (404 until the publisher connects) and keeps
 * retrying so playback starts automatically once the stream goes live.
 */
export function HlsPlayer({ src }: { src: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    setWaiting(true);

    // Native HLS (Safari / iOS).
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      const onLoaded = () => setWaiting(false);
      video.addEventListener('loadeddata', onLoaded);
      return () => video.removeEventListener('loadeddata', onLoaded);
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true, manifestLoadingMaxRetry: 999, manifestLoadingRetryDelay: 2000 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setWaiting(false);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        // Network errors (manifest 404 before the stream is live) are recoverable.
        if (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setTimeout(() => hls.startLoad(), 2000);
        }
      });
      return () => hls.destroy();
    }
  }, [src]);

  return (
    <Box sx={{ position: 'relative', bgcolor: 'common.black', borderRadius: 2, overflow: 'hidden', aspectRatio: '16 / 9' }}>
      <video
        ref={videoRef}
        controls
        playsInline
        muted
        style={{ width: '100%', height: '100%', display: 'block', background: 'var(--exprsn-black)' }}
      />
      {waiting && (
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
          <Typography color="grey.500" variant="body2">
            Waiting for the stream to go live…
          </Typography>
        </Box>
      )}
    </Box>
  );
}
