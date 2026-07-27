import { useState } from 'react';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { playableHlsUrl, type Recording } from '@/api/live';
import { HlsPlayer } from './HlsPlayer';

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * List of recorded sessions (VOD) for a stream or room, with inline playback of
 * the selected recording. Only `ready` recordings are playable; others show
 * their processing/failed status.
 */
export function RecordingsList({ recordings }: { recordings: Recording[] }) {
  const [selected, setSelected] = useState<Recording | null>(null);

  if (recordings.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        No recordings yet.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      {selected && (
        <Box>
          <HlsPlayer src={playableHlsUrl(selected.hls_url)} />
          <Typography variant="caption" color="text.secondary">
            {selected.title || 'Recording'}
            {selected.resolution ? ` · ${selected.resolution}` : ''}
          </Typography>
        </Box>
      )}

      <Stack spacing={1}>
        {recordings.map((r) => {
          const ready = r.status === 'ready' && !!r.hls_url;
          const dur = formatDuration(r.duration_seconds);
          return (
            <Paper
              key={r.id}
              variant="outlined"
              role={ready ? 'button' : undefined}
              tabIndex={ready ? 0 : undefined}
              aria-label={ready ? `Play recording ${r.title || 'Recording'}` : undefined}
              sx={{
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                cursor: ready ? 'pointer' : 'default',
                opacity: ready ? 1 : 0.7,
                borderColor: selected?.id === r.id ? 'primary.main' : undefined,
              }}
              onClick={() => ready && setSelected(r)}
              onKeyDown={(e) => {
                if (!ready) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(r);
                }
              }}
            >
              <PlayCircleOutlineIcon color={ready ? 'primary' : 'disabled'} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                  {r.title || 'Recording'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                  {dur ? ` · ${dur}` : ''}
                </Typography>
              </Box>
              {!ready && (
                <Chip
                  size="small"
                  label={r.status === 'processing' ? 'Processing' : r.status ?? 'Unavailable'}
                  color={r.status === 'failed' ? 'error' : 'default'}
                />
              )}
            </Paper>
          );
        })}
      </Stack>
    </Stack>
  );
}
