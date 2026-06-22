import { useState } from 'react';
import { Box, IconButton, Popover, Tooltip } from '@mui/material';
import EmojiEmotionsOutlinedIcon from '@mui/icons-material/EmojiEmotionsOutlined';

/**
 * Tabbed emoji selector — a React port of the Exprsn "Emoji Picker" showcase
 * component (see Exprsn Style Guide / exprsn-react-components.html), restyled
 * onto the shared `--exprsn-*` tokens + MUI so it matches the rest of the app
 * and tracks the light/dark switch. `EmojiPicker` is the presentational grid;
 * `EmojiButton` is the IconButton + Popover convenience wrapper used by
 * composers.
 */
export const EMOJI_GROUPS: Record<string, string[]> = {
  Smileys: ['😀', '😅', '😍', '🤔', '😎', '🥳', '😴', '🤯', '😂', '🙂', '😢', '😡'],
  Gestures: ['👍', '👏', '🙌', '🤝', '✌️', '🙏', '💪', '👀', '👋', '🤙', '🫶', '🤌'],
  Objects: ['🚀', '🔥', '⭐', '💡', '📦', '⚙️', '🎯', '📈', '🎉', '❤️', '✅', '💯'],
};

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [tab, setTab] = useState<string>(Object.keys(EMOJI_GROUPS)[0]);

  return (
    <Box sx={{ width: 280, p: 1 }}>
      <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
        {Object.keys(EMOJI_GROUPS).map((g) => (
          <Box
            key={g}
            component="button"
            type="button"
            onClick={() => setTab(g)}
            sx={{
              flex: 1,
              py: 0.5,
              border: 'none',
              cursor: 'pointer',
              borderRadius: 'var(--exprsn-radius-md)',
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'var(--exprsn-text-primary)',
              background: tab === g ? 'var(--exprsn-bg-active)' : 'var(--exprsn-bg-tertiary)',
            }}
          >
            {g}
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px' }}>
        {EMOJI_GROUPS[tab].map((e) => (
          <Box
            key={e}
            component="button"
            type="button"
            onClick={() => onSelect(e)}
            sx={{
              fontSize: '1.25rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              p: 0.5,
              borderRadius: 'var(--exprsn-radius-sm)',
              '&:hover': { background: 'var(--exprsn-bg-hover)' },
            }}
          >
            {e}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** IconButton that opens the EmojiPicker in a popover and forwards selections. */
export function EmojiButton({
  onSelect,
  disabled,
  size = 'small',
}: {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
  size?: 'small' | 'medium';
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <Tooltip title="Insert emoji">
        <span>
          <IconButton
            size={size}
            disabled={disabled}
            aria-label="Insert emoji"
            onClick={(e) => setAnchor(e.currentTarget)}
          >
            <EmojiEmotionsOutlinedIcon fontSize={size} />
          </IconButton>
        </span>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <EmojiPicker
          onSelect={(emoji) => {
            onSelect(emoji);
            // Keep the popover open for multi-select; close on Escape/click-away.
          }}
        />
      </Popover>
    </>
  );
}
