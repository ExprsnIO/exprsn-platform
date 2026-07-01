import { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import type { StreamChatMessage } from '@/api/live';

const MAX_LEN = 500;

/**
 * Live chat alongside a stream. Everyone sees messages; only signed-in viewers
 * can post (the composer is replaced with a hint otherwise). Messages are
 * ephemeral — the server keeps a short in-memory history, replayed on join.
 */
export function StreamChat({
  messages,
  canChat,
  chatError,
  onSend,
  currentUserId,
}: {
  messages: StreamChatMessage[];
  canChat: boolean;
  chatError: string | null;
  onSend: (text: string) => void;
  currentUserId?: string;
}) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  // Auto-scroll to the newest message unless the viewer has scrolled up.
  useEffect(() => {
    const el = listRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <Paper
      variant="outlined"
      sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 320, overflow: 'hidden' }}
    >
      <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2">Live chat</Typography>
      </Box>

      <Box ref={listRef} onScroll={onScroll} sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1 }}>
        {messages.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            No messages yet. Say hello!
          </Typography>
        ) : (
          <Stack spacing={0.75}>
            {messages.map((m) => (
              <Box key={m.id}>
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ fontWeight: 600, color: m.userId === currentUserId ? 'primary.main' : 'text.primary', mr: 0.75 }}
                >
                  {m.displayName || 'Anonymous'}
                </Typography>
                <Typography component="span" variant="body2" sx={{ wordBreak: 'break-word' }}>
                  {m.message}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <Box sx={{ borderTop: 1, borderColor: 'divider', p: 1 }}>
        {chatError && (
          <Typography variant="caption" color="error" sx={{ px: 1, display: 'block' }}>
            {chatError}
          </Typography>
        )}
        {canChat ? (
          <Stack direction="row" spacing={1} alignItems="flex-end">
            <TextField
              fullWidth
              size="small"
              placeholder="Send a message"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              multiline
              maxRows={3}
            />
            <Tooltip title="Send">
              <span>
                <IconButton color="primary" onClick={submit} disabled={!draft.trim()}>
                  <SendIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 0.5 }}>
            Sign in to join the chat.
          </Typography>
        )}
      </Box>
    </Paper>
  );
}
