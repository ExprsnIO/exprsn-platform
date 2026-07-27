import { useRef, useState } from 'react';
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

/**
 * TASK-053 — image field backed by FileVault-hosted uploads.
 *
 * The edge CSP is `img-src 'self' blob: data:` (BUG-038), so externally hosted
 * image URLs never render in the SPA. This field replaces the old free-text
 * "…URL" inputs: the user uploads an image, we store it in FileVault and mint a
 * non-expiring, read-only, file-scoped CA access token, and hand back the
 * resulting SAME-ORIGIN download URL — which the backends' `uri` validators
 * accept and the CSP permits. A plain-URL escape hatch remains, but only for
 * same-origin URLs; existing external values surface a "won't render" notice.
 */

/** True for relative URLs and absolute URLs on this origin. */
function isSameOriginUrl(url: string): boolean {
  if (!url) return true;
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

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

  const external = value !== '' && !isSameOriginUrl(value);
  const urlDraftExternal = urlDraft !== '' && !isSameOriginUrl(urlDraft);

  const pickFile = () => inputRef.current?.click();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const up = await filevaultApi.upload(file);
      // Non-expiring read-only token: the URL must keep working indefinitely.
      const tok = await filevaultApi.createFileAccessToken(up.file.id, {
        permissions: { read: true, write: false, delete: false },
      });
      onChange(new URL(tok.downloadUrl, window.location.origin).toString());
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const applyUrlDraft = () => {
    if (urlDraftExternal) return;
    onChange(urlDraft.trim());
    setUrlDraft('');
    setShowUrlField(false);
  };

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
          <Avatar
            src={!external && value ? value : undefined}
            alt=""
            sx={{ width: 56, height: 56 }}
          />
        ) : !external && value ? (
          <Box
            component="img"
            src={value}
            alt=""
            sx={{
              width: 160,
              height: 56,
              borderRadius: 1.5,
              objectFit: 'cover',
              border: 1,
              borderColor: 'divider',
            }}
          />
        ) : (
          <Box
            sx={{
              width: 160,
              height: 56,
              borderRadius: 1.5,
              bgcolor: 'action.hover',
              border: 1,
              borderColor: 'divider',
            }}
          />
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
              onClick={() => onChange('')}
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
