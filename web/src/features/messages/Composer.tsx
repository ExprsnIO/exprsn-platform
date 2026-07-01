import { useRef, useState } from 'react';
import { Alert, Box, Chip, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import ReplyIcon from '@mui/icons-material/Reply';
import { toMessage } from '@/lib/errors';
import { filevaultApi } from '@/api/filevault';
import type { ChatAttachment } from '@/api/spark';

const MAX_FILES = 6;

/** Classify a File into a ChatAttachment kind by mime type. */
function kindFor(file: File): ChatAttachment['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

export function Composer({
  onSend,
  onTyping,
  replyingTo,
  onCancelReply,
}: {
  onSend: (text: string, attachments?: ChatAttachment[]) => Promise<void>;
  onTyping: () => void;
  /** When set, the composer shows a reply banner and the parent is threaded. */
  replyingTo?: { id: string; label: string } | null;
  onCancelReply?: () => void;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const canSend = (text.trim().length > 0 || files.length > 0) && !busy;

  const submit = async () => {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      let attachments: ChatAttachment[] | undefined;
      if (files.length > 0) {
        // Upload each file to FileVault (visibility 'shared' so recipients can
        // fetch the bytes), then carry plaintext references on the message.
        const uploaded = await Promise.all(
          files.map((f) => filevaultApi.upload(f, { visibility: 'shared' })),
        );
        attachments = uploaded.map((r, i) => ({
          kind: kindFor(files[i]),
          fileId: r.file.id,
          name: files[i].name,
          mimetype: files[i].type,
          size: files[i].size,
        }));
      }
      await onSend(text.trim(), attachments);
      setText('');
      setFiles([]);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length) setFiles((prev) => [...prev, ...picked].slice(0, MAX_FILES));
    e.target.value = '';
  };

  return (
    <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}

      {replyingTo && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ mb: 1, px: 1, py: 0.5, borderRadius: 1, bgcolor: 'action.hover' }}
        >
          <ReplyIcon fontSize="small" color="action" />
          <Typography variant="caption" sx={{ flex: 1 }} noWrap>
            Replying to {replyingTo.label}
          </Typography>
          <IconButton size="small" onClick={onCancelReply}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Stack>
      )}

      {files.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
          {files.map((f, i) => (
            <Chip
              key={`${f.name}-${i}`}
              label={f.name}
              onDelete={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
              size="small"
            />
          ))}
        </Stack>
      )}

      <Stack direction="row" spacing={1} alignItems="flex-end">
        <input ref={fileRef} type="file" hidden multiple onChange={onPick} />
        <Tooltip title={files.length >= MAX_FILES ? `Up to ${MAX_FILES} files` : 'Attach files'}>
          <span>
            <IconButton onClick={() => fileRef.current?.click()} disabled={busy || files.length >= MAX_FILES}>
              <AttachFileIcon />
            </IconButton>
          </span>
        </Tooltip>
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
        <IconButton color="primary" onClick={submit} disabled={!canSend}>
          <SendIcon />
        </IconButton>
      </Stack>
    </Box>
  );
}
