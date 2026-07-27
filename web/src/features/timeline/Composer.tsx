import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { timelineApi, type Post } from '@/api/timeline';
import { filevaultApi } from '@/api/filevault';
import { toMessage } from '@/lib/errors';
import { EmojiButton } from '@/components/EmojiPicker';

const MAX_LEN = 4000;
const MAX_MEDIA = 4;
const MAX_ALT_LEN = 1000;
// AI alt-text suggestion polling (the moderation worker describes images
// asynchronously; cortex may also be disabled — absence is fine).
const SUGGESTION_POLL_MS = 2500;
const SUGGESTION_POLL_TRIES = 4;

/**
 * A locally-selected image. Uploaded to FileVault EAGERLY on selection (BUG-040)
 * so the cortex alt-text suggestion can pre-fill while the author is still
 * composing. `url` is the local preview object URL (revoked on removal).
 */
interface Selected {
  /** Local identity for React keys / state updates. */
  key: string;
  file: File;
  url: string;
  /** FileVault fileId once the eager upload completes. */
  fileId?: string;
  uploading: boolean;
  uploadError?: string;
  /** Author-editable alt text (may start from the AI suggestion). */
  alt: string;
  /** True once the author typed — the AI suggestion never overwrites edits. */
  altTouched: boolean;
}

let selectedSeq = 0;

/**
 * Post composer. Supports text + up to 4 image attachments. Images upload to
 * FileVault (visibility 'shared') as soon as they are picked; each gets an
 * editable alt-text field, pre-filled from the cortex describeImage suggestion
 * when one becomes available (never applied silently — the author can accept,
 * edit, or clear it). On submit the post is created with `media: [{id,
 * altText}]`. On success the created post is handed back to the parent so the
 * feed can prepend it immediately (the realtime `new:post` echo is de-duped).
 */
export function Composer({ onPosted }: { onPosted: (post: Post) => void }) {
  const [content, setContent] = useState('');
  const [images, setImages] = useState<Selected[]>([]);
  // TASK-048 (ATAG B.3.1.1): advisory-only missing-alt warning. Dismissible,
  // never blocks posting; re-arms when new images are added.
  const [altWarningDismissed, setAltWarningDismissed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Poll timers per image key, cleared on removal/unmount.
  const pollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Revoke all preview URLs + stop suggestion polling on unmount.
  useEffect(() => {
    const timers = pollTimers.current;
    return () => {
      images.forEach((s) => URL.revokeObjectURL(s.url));
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchImage = (key: string, patch: Partial<Selected>) =>
    setImages((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  /** Poll the AI description and pre-fill the alt field if still untouched. */
  const pollSuggestion = (key: string, fileId: string, attempt = 0) => {
    if (attempt >= SUGGESTION_POLL_TRIES) return;
    const timer = setTimeout(async () => {
      pollTimers.current.delete(key);
      try {
        const res = await filevaultApi.getFileDescription(fileId);
        const suggested = res.description?.altText?.trim();
        if (suggested) {
          setImages((prev) =>
            prev.map((s) =>
              s.key === key && !s.altTouched && !s.alt
                ? { ...s, alt: suggested.slice(0, MAX_ALT_LEN) }
                : s,
            ),
          );
          return; // got one — stop polling
        }
      } catch {
        // Suggestion is best-effort (cortex may be off) — keep trying quietly.
      }
      pollSuggestion(key, fileId, attempt + 1);
    }, SUGGESTION_POLL_MS);
    pollTimers.current.set(key, timer);
  };

  /** Eager upload so suggestions can arrive while the author composes. */
  const startUpload = async (item: Selected) => {
    try {
      const res = await filevaultApi.upload(item.file, { visibility: 'shared' });
      patchImage(item.key, { fileId: res.file.id, uploading: false });
      pollSuggestion(item.key, res.file.id);
    } catch (err) {
      patchImage(item.key, { uploading: false, uploadError: toMessage(err) });
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const media = images
        .filter((s) => s.fileId)
        .map((s) => ({
          id: s.fileId as string,
          ...(s.alt.trim() ? { altText: s.alt.trim() } : {}),
        }));
      return timelineApi.createPost(content.trim(), media.length ? { media } : undefined);
    },
    onSuccess: (res) => {
      setContent('');
      images.forEach((s) => URL.revokeObjectURL(s.url));
      pollTimers.current.forEach((t) => clearTimeout(t));
      pollTimers.current.clear();
      setImages([]);
      if (res?.post) onPosted(res.post);
    },
  });

  // Images that would be posted without a description (uploads that failed are
  // excluded — they won't be part of the post at all).
  const missingAlt = images.filter((s) => !s.uploadError && !s.alt.trim());
  const showAltWarning = missingAlt.length > 0 && !altWarningDismissed;

  const trimmed = content.trim();
  const tooLong = content.length > MAX_LEN;
  const uploadsPending = images.some((s) => s.uploading);
  const uploadsFailed = images.some((s) => s.uploadError);
  const canPost =
    (trimmed.length > 0 || images.some((s) => s.fileId)) &&
    !tooLong &&
    !uploadsPending &&
    !uploadsFailed &&
    !mutation.isPending;

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (picked.length > 0) {
      // Build outside the state updater — starting uploads inside it would
      // double-fire under StrictMode's double-invoke.
      const room = Math.max(0, MAX_MEDIA - images.length);
      const next: Selected[] = picked.slice(0, room).map((file) => ({
        key: `img-${selectedSeq++}`,
        file,
        url: URL.createObjectURL(file),
        uploading: true,
        alt: '',
        altTouched: false,
      }));
      next.forEach((item) => void startUpload(item));
      setImages((prev) => [...prev, ...next].slice(0, MAX_MEDIA));
      setAltWarningDismissed(false);
    }
    e.target.value = '';
  };

  const removeImage = (key: string) =>
    setImages((prev) => {
      const target = prev.find((s) => s.key === key);
      if (target) {
        URL.revokeObjectURL(target.url);
        const timer = pollTimers.current.get(key);
        if (timer) clearTimeout(timer);
        pollTimers.current.delete(key);
        // Best-effort cleanup of the eagerly-uploaded file.
        if (target.fileId) filevaultApi.deleteFile(target.fileId).catch(() => {});
      }
      return prev.filter((s) => s.key !== key);
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
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            }}
          >
            {images.map((s) => (
              <Stack key={s.key} spacing={0.5}>
                <Box
                  sx={{
                    position: 'relative',
                    aspectRatio: '1 / 1',
                    borderRadius: 1,
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: s.uploadError ? 'error.main' : 'divider',
                  }}
                >
                  <Box
                    component="img"
                    src={s.url}
                    alt={s.alt || s.file.name}
                    sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {s.uploading && (
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'color-mix(in srgb, var(--exprsn-black) 35%, transparent)',
                      }}
                    >
                      <CircularProgress size={20} sx={{ color: 'common.white' }} />
                    </Box>
                  )}
                  <IconButton
                    size="small"
                    onClick={() => removeImage(s.key)}
                    aria-label="Remove image"
                    sx={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      bgcolor: 'color-mix(in srgb, var(--exprsn-black) 55%, transparent)',
                      color: 'common.white',
                      '&:hover': { bgcolor: 'color-mix(in srgb, var(--exprsn-black) 75%, transparent)' },
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
                {s.uploadError ? (
                  <Alert severity="error" sx={{ py: 0 }}>
                    {s.uploadError}
                  </Alert>
                ) : (
                  <TextField
                    size="small"
                    fullWidth
                    multiline
                    maxRows={3}
                    label="Alt text"
                    placeholder="Describe this image"
                    value={s.alt}
                    onChange={(e) =>
                      patchImage(s.key, {
                        alt: e.target.value.slice(0, MAX_ALT_LEN),
                        altTouched: true,
                      })
                    }
                    inputProps={{ 'aria-label': `Alt text for ${s.file.name}` }}
                    helperText={
                      s.alt && !s.altTouched
                        ? 'AI suggestion — edit or accept'
                        : !s.alt.trim() && showAltWarning
                          ? 'No alt text yet'
                          : undefined
                    }
                    FormHelperTextProps={
                      !s.alt.trim() && showAltWarning
                        ? { sx: { color: 'warning.main', mx: 0 } }
                        : undefined
                    }
                  />
                )}
              </Stack>
            ))}
          </Box>
        )}

        {/* TASK-048 (ATAG B.3.1.1): advisory only — posting is never blocked. */}
        {showAltWarning && (
          <Alert severity="warning" onClose={() => setAltWarningDismissed(true)}>
            {missingAlt.length === 1
              ? `“${missingAlt[0].file.name}” has no alt text`
              : `${missingAlt.length} images have no alt text (${missingAlt
                  .map((s) => s.file.name)
                  .join(', ')})`}{' '}
            — screen-reader users won’t get a description. Add alt text below, or post anyway.
          </Alert>
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
            {mutation.isPending ? 'Posting…' : uploadsPending ? 'Uploading…' : 'Post'}
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
