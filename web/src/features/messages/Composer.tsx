import { useState } from 'react';
import { Alert, Box, IconButton, Stack, TextField } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { toMessage } from '@/lib/errors';

export function Composer({
  onSend,
  onTyping,
}: {
  onSend: (text: string) => Promise<void>;
  onTyping: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(trimmed);
      setText('');
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <Stack direction="row" spacing={1} alignItems="flex-end">
        <TextField
          fullWidth
          size="small"
          multiline
          maxRows={6}
          placeholder="Write an encrypted message…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <IconButton color="primary" onClick={submit} disabled={busy || !text.trim()}>
          <SendIcon />
        </IconButton>
      </Stack>
    </Box>
  );
}
