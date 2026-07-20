/**
 * Controls above the comment list: sort, threading, time-grouping and markdown
 * are persisted user prefs (timelinePrefs); the search box + "mine / has
 * replies" filters are ephemeral view state owned by CommentThread.
 */
import {
  Box,
  Chip,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ScheduleIcon from '@mui/icons-material/Schedule';
import NotesIcon from '@mui/icons-material/Notes';
import { useTimelinePrefs, type CommentSort } from '@/app/timelinePrefs';
import type { CommentFilter } from './commentTree';

const SORT_LABELS: Record<CommentSort, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  top: 'Top',
};

export function CommentToolbar({
  filter,
  onFilterChange,
}: {
  filter: CommentFilter;
  onFilterChange: (f: CommentFilter) => void;
}) {
  const { commentSort, threaded, commentGroup, markdown, set } = useTimelinePrefs();

  return (
    <Stack spacing={1} sx={{ mb: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" rowGap={1}>
        <TextField
          select
          size="small"
          label="Sort"
          value={commentSort}
          onChange={(e) => set({ commentSort: e.target.value as CommentSort })}
          sx={{ minWidth: 120 }}
        >
          {(Object.keys(SORT_LABELS) as CommentSort[]).map((s) => (
            <MenuItem key={s} value={s}>
              {SORT_LABELS[s]}
            </MenuItem>
          ))}
        </TextField>

        <Tooltip title={threaded ? 'Threaded — replies nested' : 'Flat — one chronological list'}>
          <Chip
            icon={<AccountTreeIcon />}
            label="Threaded"
            size="small"
            color={threaded ? 'primary' : 'default'}
            variant={threaded ? 'filled' : 'outlined'}
            onClick={() => set({ threaded: !threaded })}
          />
        </Tooltip>

        <Tooltip title="Group top-level comments by time (Today / This week / Earlier)">
          <Chip
            icon={<ScheduleIcon />}
            label="By time"
            size="small"
            color={commentGroup === 'time' ? 'primary' : 'default'}
            variant={commentGroup === 'time' ? 'filled' : 'outlined'}
            onClick={() => set({ commentGroup: commentGroup === 'time' ? 'none' : 'time' })}
          />
        </Tooltip>

        <Tooltip title={markdown ? 'Markdown rendering on' : 'Plain text'}>
          <Chip
            icon={<NotesIcon />}
            label="Markdown"
            size="small"
            color={markdown ? 'primary' : 'default'}
            variant={markdown ? 'filled' : 'outlined'}
            onClick={() => set({ markdown: !markdown })}
          />
        </Tooltip>
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" rowGap={1}>
        <TextField
          size="small"
          placeholder="Filter comments…"
          value={filter.query}
          onChange={(e) => onFilterChange({ ...filter, query: e.target.value })}
          sx={{ flex: 1, minWidth: 180 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: filter.query ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => onFilterChange({ ...filter, query: '' })}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
        />
        <Chip
          label="Mine"
          size="small"
          color={filter.mineOnly ? 'primary' : 'default'}
          variant={filter.mineOnly ? 'filled' : 'outlined'}
          onClick={() => onFilterChange({ ...filter, mineOnly: !filter.mineOnly })}
        />
        <Chip
          label="Has replies"
          size="small"
          color={filter.hasReplies ? 'primary' : 'default'}
          variant={filter.hasReplies ? 'filled' : 'outlined'}
          onClick={() => onFilterChange({ ...filter, hasReplies: !filter.hasReplies })}
        />
        <Box sx={{ flexGrow: 1 }} />
      </Stack>
    </Stack>
  );
}
