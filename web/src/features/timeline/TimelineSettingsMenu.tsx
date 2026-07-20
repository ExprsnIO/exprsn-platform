/**
 * Gear popover for the per-user timeline "look" preferences (persisted to
 * localStorage via timelinePrefs): which feed opens by default, row density,
 * and whether bodies render as markdown. Comment-specific prefs live in the
 * comment toolbar; this covers the feed-level look.
 */
import { useState } from 'react';
import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  IconButton,
  Popover,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import {
  useTimelinePrefs,
  type Density,
  type FeedKind,
} from '@/app/timelinePrefs';

export function TimelineSettingsMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { defaultFeed, density, markdown, set, reset } = useTimelinePrefs();

  return (
    <>
      <Tooltip title="Timeline settings">
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} aria-label="Timeline settings">
          <SettingsIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, width: 260 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Timeline settings
          </Typography>

          <Stack spacing={1.5}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Default feed
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                fullWidth
                value={defaultFeed}
                onChange={(_e, v: FeedKind | null) => v && set({ defaultFeed: v })}
                sx={{ mt: 0.5 }}
              >
                <ToggleButton value="home">Home</ToggleButton>
                <ToggleButton value="global">Global</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Density
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                fullWidth
                value={density}
                onChange={(_e, v: Density | null) => v && set({ density: v })}
                sx={{ mt: 0.5 }}
              >
                <ToggleButton value="comfortable">Comfortable</ToggleButton>
                <ToggleButton value="compact">Compact</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={markdown}
                  onChange={(e) => set({ markdown: e.target.checked })}
                />
              }
              label={<Typography variant="body2">Render markdown</Typography>}
            />
          </Stack>

          <Divider sx={{ my: 1.5 }} />
          <Button size="small" color="inherit" onClick={reset} fullWidth>
            Reset to defaults
          </Button>
        </Box>
      </Popover>
    </>
  );
}
