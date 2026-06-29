import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Box, Button, IconButton, Paper, Stack, TextField, Tooltip } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { timelineApi, type Post } from '@/api/timeline';
import { filevaultApi } from '@/api/filevault';
import { toMessage } from '@/lib/errors';
import { EmojiButton } from '@/components/EmojiPicker';

const MAX_LEN = 4000;
const MAX_MEDIA = 4;

/** A locally-selected image plus its preview object URL (revoked on removal). */
interface Selected {
  file: File;
  url: string;
}

/**
 * Post composer. Supports text + up to 4 image attachments. On submit, each
 * image is uploaded to FileVault with visibility 'shared' (so authenticated feed
 * viewers can load it), then the post is created with the resulting file ids.
 * On success it hands the created post back to the parent so the feed can
 * prepend it immediately (the realtime `new:post` echo is de-duped by id).
 */
export function Composer({ onPosted }: { onPosted: (post: Post) => void }) {
  const [content, setContent] = useState('');
  const [images, setImages] = useState<Selected[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Revoke all preview URLs on unmount.
  useEffect(() => {
    return () => {
      images.forEach((s) => URL.revokeObjectURL(s.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      let mediaIds: string[] = [];
      if (images.length > 0) {
        const uploaded = await Promise.all(
          images.map((s) => filevaultApi.upload(s.file, { visibility: 'shared' })),
        );
        mediaIds = uploaded.map((r) => r.file.id);
      }
      return timelineApi.createPost(content.trim(), mediaIds.length ? { mediaIds } : undefined);
    },
    onSuccess: (res) => {
      setContent('');
      images.forEach((s) => URL.revokeObjectURL(s.url));
      setImages([]);
      if (res?.post) onPosted(res.post);
    },
  });

  const trimmed = content.trim();
  const tooLong = content.length > MAX_LEN;
  const canPost = (trimmed.length > 0 || images.length > 0) && !tooLong && !mutation.isPending;

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (picked.length > 0) {
      setImages((prev) => {
        const room = Math.max(0, MAX_MEDIA - prev.length);
        const next = picked.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }));
        return [...prev, ...next];
      });
    }
    e.target.value = '';
  };

  const removeImage = (idx: number) =>
    setImages((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== idx);
    });

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

        {images.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gap: 1,
              gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
            }}
          >
            {images.map((s, i) => (
              <Box
                key={s.url}
                sx={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  borderRadius: 1,
                  overflow: 'hidden',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box
                  component="img"
                  src={s.url}
                  alt={s.file.name}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                <IconButton
                  size="small"
                  onClick={() => removeImage(i)}
                  aria-label="Remove image"
                  sx={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    bgcolor: 'rgba(0,0,0,0.55)',
                    color: 'common.white',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                  }}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}

        {mutation.isError && <Alert severity="error">{toMessage(mutation.error)}</Alert>}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={onPickFiles}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <EmojiButton onSelect={insertEmoji} disabled={mutation.isPending} />
          <Tooltip title={images.length >= MAX_MEDIA ? `Up to ${MAX_MEDIA} images` : 'Add images'}>
            <span>
              <IconButton
                onClick={() => fileRef.current?.click()}
                disabled={mutation.isPending || images.length >= MAX_MEDIA}
                aria-label="Add images"
              >
                <AddPhotoAlternateOutlinedIcon />
              </IconButton>
            </span>
          </Tooltip>
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
            {mutation.isPending ? 'Posting…' : 'Post'}
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
