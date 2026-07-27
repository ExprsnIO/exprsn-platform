import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Collapse,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { filevaultApi } from '@/api/filevault';
import { toMessage } from '@/lib/errors';
import { isSameOriginUrl } from '@/lib/url';

/**
 * TASK-053 — image field backed by FileVault-hosted uploads.
 *
 * The edge CSP is `img-src 'self' blob: data:` (BUG-038), so externally hosted
 * image URLs never render in the SPA. This field replaces the old free-text
 * "…URL" inputs: the user uploads an image, we store it in FileVault and hand
 * back a same-origin tokened download URL (see filevaultApi.uploadForDisplayUrl)
 * — which the backends' `uri` validators accept and the CSP permits. A
 * plain-URL escape hatch remains, but only for same-origin URLs; existing
 * external values surface a "won't render" notice.
 */

/** Shared cover-strip preview frame (image and empty placeholder). */
const coverSx = {
  width: 160,
  height: 56,
  borderRadius: 1.5,
  border: 1,
  borderColor: 'divider',
} as const;

export function ImageUploadField({
  label,
  value,
  onChange,
  variant = 'avatar',
  helperText,
}: {
  label: string;
  /** Current stored URL ('' when unset). */
  value: string;
  onChange: (url: string) => void;
  /** Preview shape: round avatar or wide cover strip. */
  variant?: 'avatar' | 'cover';
  helperText?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrlField, setShowUrlField] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  // Object URL of the just-picked file: preview locally instead of immediately
  // re-downloading the image we just uploaded. Saved/existing values still
  // preview via `value`.
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  // Revoke each object URL when it's replaced (cleanup on change) or on unmount.
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const external = useMemo(() => value !== '' && !isSameOriginUrl(value), [value]);
  const urlDraftExternal = useMemo(() => urlDraft !== '' && !isSameOriginUrl(urlDraft), [urlDraft]);

  const pickFile = () => inputRef.current?.click();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await filevaultApi.uploadForDisplayUrl(file);
      setLocalPreview(URL.createObjectURL(file));
      onChange(url);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const applyUrlDraft = () => {
    if (urlDraftExternal) return;
    setLocalPreview(null);
    onChange(urlDraft.trim());
    setUrlDraft('');
    setShowUrlField(false);
  };

  const previewSrc = localPreview ?? (!external && value ? value : undefined);

  return (
    <Stack spacing={1}>
      <Typography variant="body2" fontWeight={600}>
        {label}
      </Typography>

      {external && (
        <Alert severity="warning">
          This is an external image URL — external images won&apos;t render here (the platform
          only displays images hosted on this origin). Upload an image to replace it.
        </Alert>
      )}

      <Stack direction="row" spacing={2} alignItems="center">
        {variant === 'avatar' ? (
          <Avatar src={previewSrc} alt="" sx={{ width: 56, height: 56 }} />
        ) : previewSrc ? (
          <Box component="img" src={previewSrc} alt="" sx={{ ...coverSx, objectFit: 'cover' }} />
        ) : (
          <Box sx={{ ...coverSx, bgcolor: 'action.hover' }} />
        )}

        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FileUploadOutlinedIcon />}
            onClick={pickFile}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : value ? 'Replace image' : 'Upload image'}
          </Button>
          {value && (
            <Button
              size="small"
              color="inherit"
              startIcon={<DeleteOutlineIcon />}
              onClick={() => {
                setLocalPreview(null);
                onChange('');
              }}
              disabled={uploading}
            >
              Remove
            </Button>
          )}
        </Stack>
      </Stack>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        aria-label={`${label} file`}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {error && <Alert severity="error">{error}</Alert>}

      <Typography variant="caption" color="text.secondary">
        {helperText ?? 'Uploaded to your files and served from this origin.'}{' '}
        <Link component="button" type="button" variant="caption" onClick={() => setShowUrlField((s) => !s)}>
          Use an image URL instead
        </Link>
      </Typography>

      <Collapse in={showUrlField}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            size="small"
            fullWidth
            label={`${label} URL (same-origin only)`}
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            error={urlDraftExternal}
            helperText={
              urlDraftExternal
                ? 'External URLs are blocked by the platform image policy — upload the image instead.'
                : 'Must be a URL on this site, e.g. a file share link.'
            }
          />
          <Button size="small" onClick={applyUrlDraft} disabled={urlDraft.trim() === '' || urlDraftExternal}>
            Apply
          </Button>
        </Stack>
      </Collapse>
    </Stack>
  );
}
