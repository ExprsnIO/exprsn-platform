import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Box, Button, Paper, Stack, TextField } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { timelineApi, type Post } from '@/api/timeline';
import { toMessage } from '@/lib/errors';
import { EmojiButton } from '@/components/EmojiPicker';

const MAX_LEN = 500;

/**
 * Post composer. On success it hands the created post back to the parent so the
 * feed can prepend it immediately (the realtime `new:post` echo is de-duped by
 * id, so this stays correct whether or not the socket is connected).
 *
 * Uses the shared Exprsn EmojiButton (showcase port) to insert emoji at the
 * caret; the textarea autosizes via MUI's multiline min/maxRows.
 */
export function Composer({ onPosted }: { onPosted: (post: Post) => void }) {
  const [content, setContent] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const mutation = useMutation({
    mutationFn: () => timelineApi.createPost(content.trim()),
    onSuccess: (res) => {
      setContent('');
      if (res?.post) onPosted(res.post);
    },
  });

  const trimmed = content.trim();
  const tooLong = content.length > MAX_LEN;
  const canPost = trimmed.length > 0 && !tooLong && !mutation.isPending;

  // Insert at the caret (falls back to appending) and keep focus + selection.
  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? content.length;
    const end = el?.selectionEnd ?? content.length;
    const next = content.slice(0, start) + emoji + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      if (!el) return;
      const caret = start + emoji.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1}>
        <TextField
          inputRef={inputRef}
          multiline
          minRows={2}
          maxRows={8}
          fullWidth
          placeholder="What's happening?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter to post.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canPost) mutation.mutate();
          }}
          error={tooLong}
        />
        {mutation.isError && <Alert severity="error">{toMessage(mutation.error)}</Alert>}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <EmojiButton onSelect={insertEmoji} disabled={mutation.isPending} />
          <Box sx={{ flex: 1 }} />
          <Box
            component="span"
            sx={{ fontSize: 12, color: tooLong ? 'error.main' : 'text.secondary' }}
          >
            {content.length}/{MAX_LEN}
          </Box>
          <Button
            variant="contained"
            endIcon={<SendIcon />}
            disabled={!canPost}
            onClick={() => mutation.mutate()}
          >
            Post
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
