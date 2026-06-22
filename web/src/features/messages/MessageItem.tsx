import { useEffect, useState } from 'react';
import {
  Box,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AddReactionIcon from '@mui/icons-material/AddReaction';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import type { Message } from '@/api/spark';
import { useE2eeStore } from '@/lib/e2eeStore';
import { formatTime, initials, shortId } from './util';

const QUICK_EMOJI = ['👍', '❤️', '😂', '🎉', '🙏'];

export function MessageItem({
  message,
  currentUserId,
  nameById,
  onEdit,
  onDelete,
  onReact,
}: {
  message: Message;
  currentUserId: string;
  nameById: Record<string, string>;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
}) {
  const decrypt = useE2eeStore((s) => s.decrypt);
  const [text, setText] = useState<string | null>(message.encrypted ? null : message.content);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [menuEl, setMenuEl] = useState<null | HTMLElement>(null);
  const [emojiEl, setEmojiEl] = useState<null | HTMLElement>(null);

  const mine = message.senderId === currentUserId;

  useEffect(() => {
    let cancelled = false;
    if (message.deleted) {
      setText(null);
      return;
    }
    if (message.encrypted && message.encryptedContent) {
      decrypt(message.id, message.encryptedContent).then((pt) => {
        if (!cancelled) setText(pt);
      });
    } else {
      setText(message.content);
    }
    return () => {
      cancelled = true;
    };
  }, [message.id, message.encrypted, message.encryptedContent, message.content, message.deleted, decrypt]);

  const senderLabel = mine ? 'You' : nameById[message.senderId] || shortId(message.senderId);

  const body = message.deleted ? (
    <Typography variant="body2" sx={{ fontStyle: 'italic' }} color="text.secondary">
      Message deleted
    </Typography>
  ) : text === null ? (
    <Typography variant="body2" color="text.secondary">
      🔒 Unable to decrypt
    </Typography>
  ) : (
    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
      {text}
    </Typography>
  );

  const submitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed) onEdit(message.id, trimmed);
    setEditing(false);
  };

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ justifyContent: mine ? 'flex-end' : 'flex-start' }}
      alignItems="flex-start"
    >
      {!mine && (
        <Tooltip title={senderLabel}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              bgcolor: 'secondary.main',
              color: 'secondary.contrastText',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mt: 0.5,
              flexShrink: 0,
            }}
          >
            {initials(senderLabel)}
          </Box>
        </Tooltip>
      )}

      <Paper
        variant="outlined"
        sx={{
          p: 1.25,
          maxWidth: '70%',
          bgcolor: mine ? 'primary.main' : 'background.paper',
          color: mine ? 'primary.contrastText' : 'text.primary',
          borderColor: mine ? 'primary.main' : 'divider',
        }}
      >
        {!mine && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
            {senderLabel}
          </Typography>
        )}

        {editing ? (
          <TextField
            size="small"
            fullWidth
            multiline
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitEdit();
              }
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          body
        )}

        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            {formatTime(message.createdAt)}
            {message.edited && !message.deleted ? ' · edited' : ''}
          </Typography>
          {mine && message.readBy.some((u) => u !== currentUserId) && (
            <Tooltip title="Read">
              <DoneAllIcon sx={{ fontSize: 14, opacity: 0.8 }} />
            </Tooltip>
          )}
        </Stack>

        {message.reactions && message.reactions.length > 0 && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
            {Object.entries(
              message.reactions.reduce<Record<string, number>>((acc, r) => {
                acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                return acc;
              }, {}),
            ).map(([emoji, count]) => (
              <Chip key={emoji} size="small" label={`${emoji} ${count}`} />
            ))}
          </Stack>
        )}
      </Paper>

      {!message.deleted && (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <IconButton size="small" onClick={(e) => setEmojiEl(e.currentTarget)}>
            <AddReactionIcon sx={{ fontSize: 16 }} />
          </IconButton>
          {mine && (
            <IconButton size="small" onClick={(e) => setMenuEl(e.currentTarget)}>
              <MoreVertIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </Box>
      )}

      <Menu anchorEl={emojiEl} open={!!emojiEl} onClose={() => setEmojiEl(null)}>
        <Stack direction="row" sx={{ px: 1 }}>
          {QUICK_EMOJI.map((emoji) => (
            <IconButton
              key={emoji}
              size="small"
              onClick={() => {
                onReact(message.id, emoji);
                setEmojiEl(null);
              }}
            >
              <span>{emoji}</span>
            </IconButton>
          ))}
        </Stack>
      </Menu>

      <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)}>
        <MenuItem
          onClick={() => {
            setDraft(text ?? '');
            setEditing(true);
            setMenuEl(null);
          }}
        >
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            onDelete(message.id);
            setMenuEl(null);
          }}
        >
          Delete
        </MenuItem>
      </Menu>
    </Stack>
  );
}
