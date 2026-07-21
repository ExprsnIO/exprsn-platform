/**
 * Account → Preferences. One place that surfaces every client-side display
 * preference the app persists (theme + the timeline/comment "look" prefs that
 * were otherwise only reachable from the timeline gear and the comment toolbar).
 * All controls are bound live to their Zustand stores (themeMode / timelinePrefs)
 * and persist to localStorage on change — structured form controls, no JSON.
 */
import {
  Box,
  Button,
  Divider,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useThemeMode } from '@/app/themeMode';
import {
  useTimelinePrefs,
  INLINE_COUNT_OPTIONS,
  type CommentSort,
  type Density,
  type FeedKind,
} from '@/app/timelinePrefs';

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1.5}
      sx={{ py: 1.25, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        )}
      </Box>
      <Box sx={{ flexShrink: 0 }}>{children}</Box>
    </Stack>
  );
}

const SORT_LABEL: Record<CommentSort, string> = { newest: 'Newest', oldest: 'Oldest', top: 'Top' };

export function PreferencesSection() {
  const { mode, setMode } = useThemeMode();
  const {
    defaultFeed,
    density,
    markdown,
    feedInlineCount,
    commentSort,
    threaded,
    commentGroup,
    set,
    reset,
  } = useTimelinePrefs();

  return (
    <Stack spacing={2} sx={{ maxWidth: 640 }}>
      <Typography variant="body2" color="text.secondary">
        These preferences are stored on this device and shape how your timeline and
        comments look. They take effect immediately.
      </Typography>

      {/* Appearance */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          Appearance
        </Typography>
        <Divider sx={{ mb: 0.5 }} />

        <Row label="Theme" hint="Light or dark across the app.">
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_e, v: 'light' | 'dark' | null) => v && setMode(v)}
          >
            <ToggleButton value="light">Light</ToggleButton>
            <ToggleButton value="dark">Dark</ToggleButton>
          </ToggleButtonGroup>
        </Row>

        <Row label="Density" hint="Row spacing across the feed and comments.">
          <ToggleButtonGroup
            size="small"
            exclusive
            value={density}
            onChange={(_e, v: Density | null) => v && set({ density: v })}
          >
            <ToggleButton value="comfortable">Comfortable</ToggleButton>
            <ToggleButton value="compact">Compact</ToggleButton>
          </ToggleButtonGroup>
        </Row>

        <Row label="Render markdown" hint="Format post & comment bodies (GFM). Off = plain text.">
          <Switch checked={markdown} onChange={(e) => set({ markdown: e.target.checked })} />
        </Row>
      </Paper>

      {/* Feed */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          Feed
        </Typography>
        <Divider sx={{ mb: 0.5 }} />

        <Row label="Default feed" hint="Which feed opens first on the timeline.">
          <ToggleButtonGroup
            size="small"
            exclusive
            value={defaultFeed}
            onChange={(_e, v: FeedKind | null) => v && set({ defaultFeed: v })}
          >
            <ToggleButton value="home">Home</ToggleButton>
            <ToggleButton value="global">Global</ToggleButton>
          </ToggleButtonGroup>
        </Row>

        <Row
          label="Inline comments in feed"
          hint="How many top comments to preview under each post (by your comment sort). Off opens the post instead."
        >
          <ToggleButtonGroup
            size="small"
            exclusive
            value={feedInlineCount}
            onChange={(_e, v: number | null) => v != null && set({ feedInlineCount: v })}
          >
            {INLINE_COUNT_OPTIONS.map((n) => (
              <ToggleButton key={n} value={n}>
                {n === 0 ? 'Off' : n}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Row>
      </Paper>

      {/* Comments */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          Comments
        </Typography>
        <Divider sx={{ mb: 0.5 }} />

        <Row label="Sort" hint="Default order of top-level comments. 'Top' = most replies first.">
          <TextField
            select
            size="small"
            value={commentSort}
            onChange={(e) => set({ commentSort: e.target.value as CommentSort })}
            sx={{ minWidth: 130 }}
          >
            {(Object.keys(SORT_LABEL) as CommentSort[]).map((s) => (
              <MenuItem key={s} value={s}>
                {SORT_LABEL[s]}
              </MenuItem>
            ))}
          </TextField>
        </Row>

        <Row label="Threaded replies" hint="Nest replies under their parent. Off = one flat chronological list.">
          <Switch checked={threaded} onChange={(e) => set({ threaded: e.target.checked })} />
        </Row>

        <Row label="Group by time" hint="Section comments into Today / This week / Earlier.">
          <Switch
            checked={commentGroup === 'time'}
            onChange={(e) => set({ commentGroup: e.target.checked ? 'time' : 'none' })}
          />
        </Row>
      </Paper>

      <Box>
        <Button color="inherit" onClick={reset}>
          Reset timeline preferences to defaults
        </Button>
      </Box>
    </Stack>
  );
}
