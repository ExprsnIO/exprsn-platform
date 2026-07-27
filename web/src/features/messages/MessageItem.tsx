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
import ReplyIcon from '@mui/icons-material/Reply';
import ForwardIcon from '@mui/icons-material/Forward';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import PushPinIcon from '@mui/icons-material/PushPin';
import type { Message } from '@/api/spark';
import { useE2eeStore } from '@/lib/e2eeStore';
import { formatTime, initials, shortId } from './util';
import { MessageAttachments } from './MessageAttachments';

const QUICK_EMOJI = ['👍', '❤️', '😂', '🎉', '🙏'];

export function MessageItem({
  message,
  currentUserId,
  nameById,
  parentSenderLabel,
  canPin,
  onEdit,
  onDelete,
  onReact,
  onReply,
  onForward,
  onPin,
  onUnpin,
}: {
  message: Message;
  currentUserId: string;
  nameById: Record<string, string>;
  /** Sender label of the message this one replies to (shown as a quote chip). */
  parentSenderLabel?: string;
  /** Whether the viewer may pin/unpin (group admins/owners). */
  canPin?: boolean;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onReply?: (message: Message) => void;
  onForward?: (message: Message, decryptedText: string | null) => void;
  onPin?: (id: string) => void;
  onUnpin?: (id: string) => void;
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

        {message.parentMessageId && !message.deleted && (
          <Box
            sx={{
              borderLeft: 2,
              borderColor: mine ? 'primary.contrastText' : 'primary.main',
              opacity: 0.8,
              pl: 1,
              mb: 0.5,
            }}
          >
            <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <ReplyIcon sx={{ fontSize: 13 }} />
              Reply to {parentSenderLabel || 'a message'}
            </Typography>
          </Box>
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

        {!message.deleted && Array.isArray(message.attachments) && message.attachments.length > 0 && (
          <MessageAttachments attachments={message.attachments} mine={mine} />
        )}

        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
          {message.isPinned && !message.deleted && (
            <Tooltip title="Pinned">
              <PushPinIcon sx={{ fontSize: 13, opacity: 0.8 }} />
            </Tooltip>
          )}
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
          <IconButton size="small" aria-label="React" onClick={(e) => setEmojiEl(e.currentTarget)}>
            <AddReactionIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <IconButton size="small" aria-label="Message actions" onClick={(e) => setMenuEl(e.currentTarget)}>
            <MoreVertIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      )}

      <Menu anchorEl={emojiEl} open={!!emojiEl} onClose={() => setEmojiEl(null)}>
        <Stack direction="row" sx={{ px: 1 }}>
          {QUICK_EMOJI.map((emoji) => (
            <IconButton
              key={emoji}
              size="small"
              aria-label={`React with ${emoji}`}
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
        {onReply && (
          <MenuItem
            onClick={() => {
              onReply(message);
              setMenuEl(null);
            }}
          >
            <ReplyIcon fontSize="small" sx={{ mr: 1 }} /> Reply
          </MenuItem>
        )}
        {onForward && (
          <MenuItem
            onClick={() => {
              onForward(message, text);
              setMenuEl(null);
            }}
          >
            <ForwardIcon fontSize="small" sx={{ mr: 1 }} /> Forward
          </MenuItem>
        )}
        {canPin &&
          (message.isPinned
            ? onUnpin && (
                <MenuItem
                  onClick={() => {
                    onUnpin(message.id);
                    setMenuEl(null);
                  }}
                >
                  <PushPinIcon fontSize="small" sx={{ mr: 1 }} /> Unpin
                </MenuItem>
              )
            : onPin && (
                <MenuItem
                  onClick={() => {
                    onPin(message.id);
                    setMenuEl(null);
                  }}
                >
                  <PushPinOutlinedIcon fontSize="small" sx={{ mr: 1 }} /> Pin
                </MenuItem>
              ))}
        {mine && [
          <MenuItem
            key="edit"
            onClick={() => {
              setDraft(text ?? '');
              setEditing(true);
              setMenuEl(null);
            }}
          >
            Edit
          </MenuItem>,
          <MenuItem
            key="delete"
            onClick={() => {
              onDelete(message.id);
              setMenuEl(null);
            }}
          >
            Delete
          </MenuItem>,
        ]}
      </Menu>
    </Stack>
  );
}
