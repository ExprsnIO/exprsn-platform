import { useEffect, useRef } from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';

/**
 * A single video tile. Binds a MediaStream to the <video> element imperatively
 * (srcObject is not a declarative prop). Local tiles are muted to avoid echo.
 */
export function VideoTile({
  stream,
  label,
  muted = false,
  mirrored = false,
  audioEnabled = true,
  videoEnabled = true,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  mirrored?: boolean;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, [stream]);

  return (
    <Box
      sx={{
        position: 'relative',
        aspectRatio: '16 / 9',
        bgcolor: 'common.black',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: mirrored ? 'scaleX(-1)' : undefined,
          display: videoEnabled ? 'block' : 'none',
        }}
      />
      {!videoEnabled && (
        <Stack alignItems="center" justifyContent="center" sx={{ position: 'absolute', inset: 0 }}>
          <VideocamOffIcon sx={{ color: 'grey.500', fontSize: 40 }} />
        </Stack>
      )}
      <Stack
        direction="row"
        spacing={0.5}
        alignItems="center"
        sx={{ position: 'absolute', left: 8, bottom: 8 }}
      >
        <Chip
          size="small"
          label={label}
          sx={{ bgcolor: 'color-mix(in srgb, var(--exprsn-black) 60%, transparent)', color: 'common.white' }}
        />
        {!audioEnabled && (
          <MicOffIcon sx={{ color: 'error.light', fontSize: 18 }} titleAccess="Muted" />
        )}
      </Stack>
      {!stream && (
        <Typography
          variant="caption"
          sx={{ position: 'absolute', top: 8, right: 8, color: 'grey.500' }}
        >
          connecting…
        </Typography>
      )}
    </Box>
  );
}
